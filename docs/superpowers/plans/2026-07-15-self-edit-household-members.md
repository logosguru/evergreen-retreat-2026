# 성도 본인 가구 멤버 추가/삭제 + 회비 납입 원장 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 성도가 본인 가구의 비-가구주 멤버를 추가/삭제하고 객실 타입을 바꿀 수 있게 하며, 회비 부족분을 자동 계산해 가구주가 PayPal로 추가 납입하고, 관리자가 가구별 납입 이력(PayPal·현금 등)과 잔액·환불을 확인·기록할 수 있게 한다.

**Architecture:** 회비 납입을 `fee_payments` 원장 테이블(건별 금액·날짜·수단)로 관리한다. `balance = household_total − Σamount`. 성도 self-edit은 SECURITY DEFINER RPC(`remove_my_member`, `my_household_head_ids`)로 안전하게 멤버를 추가/삭제하고, 관리자는 원장 CRUD로 납입/환불을 수동 기록한다. `attendees.paid`는 원장 파생값으로 대체.

**Tech Stack:** Next.js 16 App Router(server actions), Supabase(Postgres + RLS + RPC), next-intl v4, Tailwind v4, TypeScript.

## Global Constraints

- Next 16: 미들웨어는 `proxy.ts`. 서버 세션은 `supabase.auth.getClaims()` (never `getSession()`). 인증 라우트는 `[locale]` 밖.
- Supabase: `@supabase/ssr`만. 서버 클라이언트 `createClient` = `@/lib/supabase/server`.
- DB enum/토큰은 영문 저장, 화면 라벨은 messages(ko/en/es 3언어 전부) 번역. DB에 표시 문자열 저장 금지.
- 서버 액션으로 모든 폼 mutation. 관리자 전용 액션은 `isAdminSession()`로 클레임 확인 + RLS.
- 회비 금액은 저장하지 않고 배정 타입 단가로 계산(6세 미만 $0). 납부 상태는 원장 합계로 파생.
- 문구 규칙: '교우' 금지→'성도', 주일=Lord's Day, es는 "Encuentro Bendito" 유지.
- 이 저장소는 **자동 테스트 러너가 없다**(Phase 1~4 무테스트). 각 태스크 검증 = `npx tsc --noEmit` + `npm run lint` + (DB) 로컬 psql 쿼리 + (UI) 수동/브라우저 시나리오. 순수 로직은 tsc로 타입 보장.
- 로컬 개발: `supabase start` → `npm run dev`(http://localhost:3000). 매직링크 메일은 Mailpit http://127.0.0.1:54324.

---

### Task 1: DB 마이그레이션 0019 — fee_payments 원장 + 헬퍼 + 트리거 + 백필

**Files:**
- Create: `supabase/migrations/0019_fee_payments.sql`

**Interfaces:**
- Produces (DB):
  - table `public.fee_payments(id uuid, head_id uuid, amount int, method text, note text, paid_at date, created_at timestamptz)`
  - `public.my_household_head_ids() returns setof uuid` (SECURITY DEFINER, grant authenticated)
  - `public.household_total(head_id uuid) returns int` (SECURITY DEFINER, grant authenticated)
  - `public.remove_my_member(member_id uuid) returns void` (SECURITY DEFINER, grant authenticated)
  - `public.my_household_fee() returns table(total int, type_selected boolean, paid_total int, balance int)` (재작성)
  - guard 트리거에서 `requested_room_type_id` paid-lock 제거

- [ ] **Step 1: 마이그레이션 파일 작성**

Create `supabase/migrations/0019_fee_payments.sql`:

```sql
-- ============ 회비 납입 원장(ledger) ============
-- 관리자가 개별 납입/환불 건(금액·날짜·수단)을 기록. 잔액 = household_total - Σamount.
-- PayPal은 기부 링크 방식(웹훅 없음) → 관리자가 입금 확인 후 수동 기록. 현금도 동일.

create table public.fee_payments (
  id         uuid primary key default gen_random_uuid(),
  head_id    uuid not null references public.attendees(id) on delete cascade,
  amount     int  not null,            -- USD 정수. 음수 = 환불
  method     text,                     -- 'paypal' | 'cash' | 'check' | 'import' 등
  note       text,
  paid_at    date not null,            -- 결제/환불 발생일 (관리자 입력)
  created_at timestamptz not null default now()
);
create index fee_payments_head_idx on public.fee_payments(head_id);
alter table public.fee_payments enable row level security;

-- 현재 세션이 속한 가구의 '가구주 id' 집합 (본인=head면 id, 아니면 householder_id).
-- attendees 정책 안의 재귀를 피하려고 my_attendee_ids(SECURITY DEFINER) 위에 얹는다.
create or replace function public.my_household_head_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct case when is_householder then id else householder_id end
  from public.attendees
  where id in (select public.my_attendee_ids())
    and (is_householder or householder_id is not null);
$$;
grant execute on function public.my_household_head_ids to authenticated;

-- 가구 회비 total = 선택 타입 1인 단가 × (해당 가구 6세 이상 인원수). 미선택/미존재 = 0.
create or replace function public.household_total(head_id uuid)
returns int
language sql stable security definer set search_path = public as $$
  select (
    coalesce(
      (select rt.price_per_person from public.room_types rt
        where rt.id = (select requested_room_type_id from public.attendees where id = head_id)),
      0)
    * (select count(*) from public.attendees a
        where (a.id = head_id or a.householder_id = head_id) and not a.is_under_6)
  )::int;
$$;
grant execute on function public.household_total to authenticated;

-- 성도 자가 삭제: 호출자 가구의 '비-가구주' 멤버만 삭제 (head/타 가구는 무시 → 0 rows).
create or replace function public.remove_my_member(member_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.attendees
  where id = member_id
    and is_householder = false
    and householder_id in (select public.my_household_head_ids());
end $$;
grant execute on function public.remove_my_member to authenticated;

-- RLS: 관리자 전체 CRUD, 성도는 본인 가구 원장 읽기만.
create policy "fee_payments_admin" on public.fee_payments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "fee_payments_select_own" on public.fee_payments
  for select to authenticated
  using (head_id in (select public.my_household_head_ids()));

-- guard 트리거 재작성: paid 후 객실 타입 잠금 제거(성도가 납부 후에도 타입 변경 가능).
-- 나머지 관리자 전용 컬럼 보호는 유지.
create or replace function public.guard_privileged_cols()
returns trigger language plpgsql as $$
begin
  if not public.is_admin() then
    new.paid            := old.paid;
    new.paid_at         := old.paid_at;
    new.retreat_group   := old.retreat_group;
    new.is_group_leader := old.is_group_leader;
    new.is_householder  := old.is_householder;
    new.householder_id  := old.householder_id;
    new.room_id         := old.room_id;
    new.language        := old.language;
  end if;
  return new;
end $$;

-- 회비 RPC 재작성: paid_total(원장 합계)·balance 반환.
drop function if exists public.my_household_fee();
create function public.my_household_fee()
returns table (total int, type_selected boolean, paid_total int, balance int)
language sql stable security definer set search_path = public as $$
  with h as (
    select id, requested_room_type_id
    from public.attendees
    where id in (select public.my_household_head_ids())
    limit 1
  )
  select
    public.household_total((select id from h)) as total,
    (select requested_room_type_id from h) is not null as type_selected,
    coalesce((select sum(amount)::int from public.fee_payments
              where head_id = (select id from h)), 0) as paid_total,
    (public.household_total((select id from h))
      - coalesce((select sum(amount)::int from public.fee_payments
                  where head_id = (select id from h)), 0))::int as balance;
$$;
grant execute on function public.my_household_fee to authenticated;

-- 백필: 기존 paid=true 가구주는 원장 1건('import')으로 이관해 잔액을 0에서 출발.
insert into public.fee_payments (head_id, amount, method, note, paid_at)
select a.id, public.household_total(a.id), 'import', '기존 납부 이관',
       coalesce(a.paid_at::date, current_date)
from public.attendees a
where a.is_householder and a.paid and public.household_total(a.id) > 0;
```

- [ ] **Step 2: 로컬 Supabase에 적용**

Run: `supabase start` (이미 떠있으면 생략) → `supabase db reset`
Expected: 모든 마이그레이션 0001~0019가 에러 없이 적용됨. 마지막에 `Finished supabase db reset`.

- [ ] **Step 3: 스키마·함수 SQL 검증**

Run:
```bash
supabase db reset >/dev/null 2>&1; \
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" -c \
"\d public.fee_payments" -c \
"select proname from pg_proc where proname in ('my_household_head_ids','household_total','remove_my_member','my_household_fee') order by 1;"
```
Expected: `fee_payments` 테이블 컬럼(id/head_id/amount/method/note/paid_at/created_at)과 네 함수 이름이 모두 출력됨.

> psql 경로가 다르면 `supabase status`의 DB URL을 직접 사용. (로컬 기본: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`)

- [ ] **Step 4: guard 트리거의 room-type-lock 제거 확인**

Run:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c \
"select prosrc from pg_proc where proname='guard_privileged_cols';"
```
Expected: 함수 본문에 `requested_room_type_id`가 **나타나지 않음** (제거됨). `language`는 포함.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0019_fee_payments.sql
git commit -m "feat(db): 회비 납입 원장 fee_payments + 헬퍼 RPC + guard 트리거 room-type 잠금 해제 (0019)"
```

---

### Task 2: 타입 + lib/fees 잔액 헬퍼

**Files:**
- Modify: `src/lib/types.ts` (Attendee 아래에 FeePayment/PaymentMethod 추가)
- Modify: `src/lib/fees.ts` (paidByHead, householdBalance 추가)

**Interfaces:**
- Consumes: `Attendee` 타입.
- Produces:
  - `interface FeePayment { id: string; head_id: string; amount: number; method: string | null; note: string | null; paid_at: string; created_at: string; }`
  - `const PAYMENT_METHODS = ["paypal", "cash", "check"] as const; type PaymentMethod`
  - `function paidByHead(payments: {head_id: string; amount: number}[]): Map<string, number>`
  - `function householdBalance(total: number, paidTotal: number): number`

- [ ] **Step 1: types.ts에 FeePayment/PaymentMethod 추가**

`src/lib/types.ts` 의 `RoomType` interface **위**에 추가:

```ts
export const PAYMENT_METHODS = ["paypal", "cash", "check"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// 회비 납입 원장 1건 (관리자 기록). amount 음수 = 환불.
export interface FeePayment {
  id: string;
  head_id: string;
  amount: number;
  method: string | null;
  note: string | null;
  paid_at: string; // YYYY-MM-DD
  created_at: string;
}
```

- [ ] **Step 2: fees.ts에 잔액 헬퍼 추가**

`src/lib/fees.ts` 파일 맨 끝에 추가:

```ts
// 가구주 id → 납입 합계(net, 환불 반영) 맵. 원장 행들을 head_id로 집계.
export function paidByHead(
  payments: { head_id: string; amount: number }[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of payments) m.set(p.head_id, (m.get(p.head_id) ?? 0) + p.amount);
  return m;
}

// 잔액: 양수 = 추가 납부 필요, 음수 = 환불 필요, 0 = 정산 완료.
export function householdBalance(total: number, paidTotal: number): number {
  return total - paidTotal;
}
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/fees.ts
git commit -m "feat(lib): FeePayment 타입 + paidByHead/householdBalance 잔액 헬퍼"
```

---

### Task 3: i18n 키 추가 (ko/en/es 3언어)

**Files:**
- Modify: `messages/ko.json`, `messages/en.json`, `messages/es.json`

**Interfaces:**
- Produces: 아래 키들이 세 파일의 해당 네임스페이스에 존재 (이후 UI 태스크가 참조).

- [ ] **Step 1: Fee 네임스페이스에 잔액/납입 키 추가**

세 파일의 `"Fee"` 객체에 다음 키 추가 (기존 키 유지).

`messages/ko.json` → `Fee`:
```json
"balanceOwe": "추가 납부 필요",
"balanceRefund": "환불 예정",
"balanceRefundNote": "환불은 관리자가 처리합니다.",
"payBalanceWithPaypal": "PayPal로 부족분 {amount} 납부하기",
"paymentHistory": "납입 내역",
"methodPaypal": "PayPal",
"methodCash": "현금",
"methodCheck": "수표",
"methodImport": "기존 이관"
```

`messages/en.json` → `Fee`:
```json
"balanceOwe": "Additional payment due",
"balanceRefund": "Refund due",
"balanceRefundNote": "Refunds are processed by an admin.",
"payBalanceWithPaypal": "Pay the {amount} balance with PayPal",
"paymentHistory": "Payment history",
"methodPaypal": "PayPal",
"methodCash": "Cash",
"methodCheck": "Check",
"methodImport": "Imported"
```

`messages/es.json` → `Fee`:
```json
"balanceOwe": "Pago adicional pendiente",
"balanceRefund": "Reembolso pendiente",
"balanceRefundNote": "Los reembolsos los procesa un administrador.",
"payBalanceWithPaypal": "Pagar el saldo de {amount} con PayPal",
"paymentHistory": "Historial de pagos",
"methodPaypal": "PayPal",
"methodCash": "Efectivo",
"methodCheck": "Cheque",
"methodImport": "Importado"
```

- [ ] **Step 2: Edit 네임스페이스에 멤버 추가/삭제 키 추가**

`messages/ko.json` → `Edit`:
```json
"addMember": "가족 추가",
"newMemberTitle": "새 가족 구성원",
"saveNewMember": "추가",
"cancel": "취소",
"removeMember": "삭제",
"confirmRemove": "이 구성원을 삭제할까요? 되돌릴 수 없습니다.",
"memberAdded": "가족이 추가되었습니다.",
"memberRemoved": "구성원이 삭제되었습니다.",
"capacityWarning": "선택한 객실({capacity}인실)보다 인원({count}명)이 많습니다. 더 큰 객실 타입을 선택해 주세요."
```

`messages/en.json` → `Edit`:
```json
"addMember": "Add family member",
"newMemberTitle": "New family member",
"saveNewMember": "Add",
"cancel": "Cancel",
"removeMember": "Remove",
"confirmRemove": "Remove this member? This cannot be undone.",
"memberAdded": "Family member added.",
"memberRemoved": "Member removed.",
"capacityWarning": "Your party ({count}) exceeds the selected room ({capacity}-person). Please choose a larger room type."
```

`messages/es.json` → `Edit`:
```json
"addMember": "Agregar familiar",
"newMemberTitle": "Nuevo familiar",
"saveNewMember": "Agregar",
"cancel": "Cancelar",
"removeMember": "Eliminar",
"confirmRemove": "¿Eliminar a este miembro? No se puede deshacer.",
"memberAdded": "Familiar agregado.",
"memberRemoved": "Miembro eliminado.",
"capacityWarning": "Su grupo ({count}) supera la habitación seleccionada (de {capacity} personas). Elija un tipo de habitación más grande."
```

- [ ] **Step 3: Admin 네임스페이스에 원장/잔액/대시보드 키 추가**

`messages/ko.json` → `Admin`:
```json
"colBalance": "잔액",
"balanceOwe": "추가 납부 {amount}",
"balanceRefund": "환불 {amount}",
"balanceSettled": "정산 완료",
"managePayments": "납입 관리",
"paymentsTitle": "회비 납입 관리",
"paymentTotal": "가구 회비",
"paymentPaid": "납입 합계",
"paymentBalance": "잔액",
"paymentListTitle": "납입 내역",
"paymentEmpty": "기록된 납입이 없습니다.",
"recordPayment": "납입 기록",
"recordRefund": "환불 기록",
"paymentAmount": "금액 (USD)",
"paymentMethod": "수단",
"paymentDate": "날짜",
"paymentNote": "메모",
"deletePayment": "삭제",
"confirmDeletePayment": "이 납입 기록을 삭제할까요?",
"paymentSaved": "기록되었습니다.",
"paymentError": "기록 중 문제가 발생했습니다.",
"dashCollected": "수납",
"dashOutstanding": "미납",
"dashRefundDue": "환불 필요",
"dashSettledHouseholds": "정산 가구"
```

`messages/en.json` → `Admin`:
```json
"colBalance": "Balance",
"balanceOwe": "Owes {amount}",
"balanceRefund": "Refund {amount}",
"balanceSettled": "Settled",
"managePayments": "Payments",
"paymentsTitle": "Fee payments",
"paymentTotal": "Household fee",
"paymentPaid": "Total paid",
"paymentBalance": "Balance",
"paymentListTitle": "Payment history",
"paymentEmpty": "No payments recorded.",
"recordPayment": "Record payment",
"recordRefund": "Record refund",
"paymentAmount": "Amount (USD)",
"paymentMethod": "Method",
"paymentDate": "Date",
"paymentNote": "Note",
"deletePayment": "Delete",
"confirmDeletePayment": "Delete this payment record?",
"paymentSaved": "Saved.",
"paymentError": "Something went wrong.",
"dashCollected": "Collected",
"dashOutstanding": "Outstanding",
"dashRefundDue": "Refunds due",
"dashSettledHouseholds": "Settled households"
```

`messages/es.json` → `Admin`:
```json
"colBalance": "Saldo",
"balanceOwe": "Debe {amount}",
"balanceRefund": "Reembolso {amount}",
"balanceSettled": "Liquidado",
"managePayments": "Pagos",
"paymentsTitle": "Pagos de cuota",
"paymentTotal": "Cuota familiar",
"paymentPaid": "Total pagado",
"paymentBalance": "Saldo",
"paymentListTitle": "Historial de pagos",
"paymentEmpty": "No hay pagos registrados.",
"recordPayment": "Registrar pago",
"recordRefund": "Registrar reembolso",
"paymentAmount": "Monto (USD)",
"paymentMethod": "Método",
"paymentDate": "Fecha",
"paymentNote": "Nota",
"deletePayment": "Eliminar",
"confirmDeletePayment": "¿Eliminar este registro de pago?",
"paymentSaved": "Guardado.",
"paymentError": "Algo salió mal.",
"dashCollected": "Recaudado",
"dashOutstanding": "Pendiente",
"dashRefundDue": "Reembolsos pendientes",
"dashSettledHouseholds": "Familias liquidadas"
```

- [ ] **Step 4: JSON 유효성 + 키 일치 검증**

Run:
```bash
node -e "['ko','en','es'].forEach(l=>{const m=require('./messages/'+l+'.json'); ['balanceOwe','payBalanceWithPaypal','paymentHistory'].forEach(k=>{if(!m.Fee[k])throw new Error(l+' Fee.'+k)}); ['addMember','capacityWarning','confirmRemove'].forEach(k=>{if(!m.Edit[k])throw new Error(l+' Edit.'+k)}); ['colBalance','recordPayment','dashCollected','dashRefundDue'].forEach(k=>{if(!m.Admin[k])throw new Error(l+' Admin.'+k)});}); console.log('i18n keys OK')"
```
Expected: `i18n keys OK` (JSON 파싱 성공 + 대표 키 존재).

- [ ] **Step 5: Commit**

```bash
git add messages/ko.json messages/en.json messages/es.json
git commit -m "feat(i18n): 멤버 추가/삭제·회비 잔액·납입 원장 문구 (ko/en/es)"
```

---

### Task 4: 성도 self-edit 서버 액션 (addMyMember / removeMyMember / updateMyRoomType 잠금 해제)

**Files:**
- Modify: `src/app/[locale]/edit/actions.ts`

**Interfaces:**
- Consumes: `rowFor`, `validatePerson`, `clean`, `PersonInput` from `@/lib/attendee-rows`; RPC `my_household_head_ids`, `remove_my_member`.
- Produces:
  - `addMyMember(input: PersonInput): Promise<EditResult>`
  - `removeMyMember(memberId: string): Promise<EditResult>`
  - `updateMyRoomType(roomTypeId: string | null): Promise<EditResult>` (재작성 — paid 잠금 제거)

- [ ] **Step 1: import 정리 + addMyMember/removeMyMember 추가**

`src/app/[locale]/edit/actions.ts` 상단 import를 다음으로 교체 (기존 `clean` 로컬 정의 제거하고 lib 사용):

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { clean, rowFor, validatePerson } from "@/lib/attendee-rows";
import type { PersonInput } from "@/lib/attendee-rows";
import { verifyTurnstile } from "@/lib/turnstile";

export type { PersonInput };
export type EditResult = { ok: true } | { ok: false; error: string };
```

> 파일에 있던 `function clean(...)` 로컬 정의와 `import type { PersonInput } from "../register/actions"`는 삭제(위 import로 대체). `updateMyAttendee`/`requestEditMagicLink`의 `clean(...)`/`PersonInput` 사용은 그대로 동작.

`updateMyAttendee` 함수 **위**에 두 액션 추가:

```ts
// 본인 가구에 비-가구주 멤버 1명 추가. head는 my_household_head_ids로 검증(클라이언트 신뢰 안 함).
export async function addMyMember(input: PersonInput): Promise<EditResult> {
  if (validatePerson(input)) return { ok: false, error: "validationName" };
  const supabase = await createClient();
  const { data: headData } = await supabase.rpc("my_household_head_ids");
  const headId = ((headData as string[] | null) ?? [])[0];
  if (!headId) return { ok: false, error: "updateError" };
  const { error } = await supabase.from("attendees").insert(
    rowFor(input, {
      id: crypto.randomUUID(),
      is_householder: false,
      email: null,
      householder_id: headId,
    }),
  );
  if (error) return { ok: false, error: "updateError" };
  return { ok: true };
}

// 본인 가구의 비-가구주 멤버 삭제 (RPC가 head/타 가구 거부).
export async function removeMyMember(memberId: string): Promise<EditResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_my_member", {
    member_id: memberId,
  });
  if (error) return { ok: false, error: "updateError" };
  return { ok: true };
}
```

- [ ] **Step 2: updateMyRoomType 재작성 (paid 잠금 제거)**

파일 하단의 기존 `updateMyRoomType` 전체를 다음으로 교체:

```ts
// 본인 가구의 객실 타입 선택(가구주 행). 납부 여부와 무관하게 변경 허용(차액은 원장/잔액으로 정산).
export async function updateMyRoomType(
  roomTypeId: string | null,
): Promise<EditResult> {
  const supabase = await createClient();
  const { data: headData } = await supabase.rpc("my_household_head_ids");
  const headId = ((headData as string[] | null) ?? [])[0];
  if (!headId) return { ok: false, error: "updateError" };
  const { error } = await supabase
    .from("attendees")
    .update({ requested_room_type_id: roomTypeId })
    .eq("id", headId);
  if (error) return { ok: false, error: "updateError" };
  return { ok: true };
}
```

- [ ] **Step 3: 타입체크 + 린트**

Run: `npx tsc --noEmit && npm run lint`
Expected: 에러 없음. (`EditForm.tsx`가 여전히 `updateMyAttendee`/`updateMyRoomType`를 import — 시그니처 동일하므로 OK)

- [ ] **Step 4: Commit**

```bash
git add src/app/[locale]/edit/actions.ts
git commit -m "feat(edit): 성도 가구 멤버 추가/삭제 액션 + 객실 타입 변경 잠금 해제"
```

---

### Task 5: EditForm UI — 멤버 추가/삭제 + 정원 경고

**Files:**
- Modify: `src/components/EditForm.tsx`
- Modify: `src/components/HouseholdFeeCard.tsx` (props 변경 — Task 6에서 소비하지만 여기선 미변경, 아래 주의)

**Interfaces:**
- Consumes: `addMyMember`, `removeMyMember`, `updateMyRoomType` (Task 4); `emptyPerson`, `PersonFields`; `RoomTypeSelect`; `roomTypes: RoomType[]` prop.
- Produces: 사용자가 가족 추가/삭제 및 타입 변경 가능한 폼.

> 이 태스크는 EditForm의 **멤버 추가/삭제 + 정원 경고**만 다룬다. 회비 카드/매니지 페이지의 잔액·delta 결제는 Task 6.

- [ ] **Step 1: EditForm에 add/remove 상태·핸들러 + 정원 경고 추가**

`src/components/EditForm.tsx`를 아래로 교체 (기존 구조 유지 + 추가):

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { PersonFields, emptyPerson } from "./PersonFields";
import { RoomTypeSelect } from "./RoomTypeSelect";
import {
  updateMyAttendee,
  updateMyRoomType,
  addMyMember,
  removeMyMember,
} from "@/app/[locale]/edit/actions";
import type { PersonInput } from "@/app/[locale]/register/actions";
import type { Attendee, RoomType } from "@/lib/types";
import { displayName } from "@/lib/names";

function toPersonInput(a: Attendee): PersonInput {
  return {
    korean_name: a.korean_name ?? "",
    english_name: a.english_name ?? "",
    district: a.district ?? "",
    gender: a.gender ?? "",
    role: a.role ?? "",
    phone: a.phone ?? "",
    is_under_6: a.is_under_6,
    attendance: a.attendance,
    arrival_at: a.arrival_at ? a.arrival_at.slice(0, 10) : "",
    departure_at: a.departure_at ? a.departure_at.slice(0, 10) : "",
    note: a.note ?? "",
  };
}

export function EditForm({
  initial,
  roomTypes,
  currentRoomTypeId,
}: {
  initial: Attendee[];
  roomTypes: RoomType[];
  currentRoomTypeId: string;
}) {
  const t = useTranslations("Edit");
  const tc = useTranslations("Common");
  const ta = useTranslations("Admin");
  const tfee = useTranslations("Fee");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [roomTypeId, setRoomTypeId] = useState(currentRoomTypeId);
  const [rtSaved, setRtSaved] = useState(false);
  const [rtError, setRtError] = useState(false);

  // 새 멤버 추가 폼
  const [adding, setAdding] = useState(false);
  const [newMember, setNewMember] = useState<PersonInput>(emptyPerson);
  const [addError, setAddError] = useState(false);

  const [rows, setRows] = useState(() =>
    initial.map((a) => ({
      id: a.id,
      isHead: a.is_householder,
      data: toPersonInput(a),
    })),
  );

  // 정원 경고: 6세 이상 인원수 > 선택 타입 capacity
  const headcount = rows.filter((r) => !r.data.is_under_6).length;
  const selectedType = roomTypes.find((rt) => rt.id === roomTypeId);
  const overCapacity = selectedType && headcount > selectedType.capacity;

  function patch(id: string, p: Partial<PersonInput>) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, data: { ...r.data, ...p } } : r)),
    );
    setSavedId(null);
  }

  function save(id: string, data: PersonInput) {
    setSavingId(id);
    setSavedId(null);
    setErrorId(null);
    start(async () => {
      const result = await updateMyAttendee(id, data);
      setSavingId(null);
      if (result.ok) {
        setSavedId(id);
        router.refresh();
      } else {
        setErrorId(id);
      }
    });
  }

  function saveRoomType(next: string) {
    setRoomTypeId(next);
    setRtSaved(false);
    setRtError(false);
    start(async () => {
      const r = await updateMyRoomType(next === "" ? null : next);
      if (r.ok) {
        setRtSaved(true);
        router.refresh();
      } else {
        setRtError(true);
      }
    });
  }

  function addMember() {
    setAddError(false);
    start(async () => {
      const r = await addMyMember(newMember);
      if (r.ok) {
        setAdding(false);
        setNewMember(emptyPerson());
        router.refresh();
      } else {
        setAddError(true);
      }
    });
  }

  function removeMember(id: string) {
    if (!window.confirm(t("confirmRemove"))) return;
    start(async () => {
      const r = await removeMyMember(id);
      if (r.ok) {
        setRows((prev) => prev.filter((row) => row.id !== id));
        router.refresh();
      }
    });
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
        {t("notFound")}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white/70 p-5 ring-1 ring-line">
        <label className="block text-sm font-medium text-bark">
          {tfee("roomType")}
        </label>
        <RoomTypeSelect
          roomTypes={roomTypes}
          value={roomTypeId}
          onChange={saveRoomType}
          className="mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm shadow-sm focus:border-moss focus:outline-none focus:ring-1 focus:ring-moss"
        />
        {overCapacity && (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
            {t("capacityWarning", {
              count: headcount,
              capacity: selectedType!.capacity,
            })}
          </p>
        )}
        {rtSaved ? (
          <p className="mt-1 text-xs text-moss">{t("updateSuccess")}</p>
        ) : rtError ? (
          <p className="mt-1 text-xs text-rose-700">{t("updateError")}</p>
        ) : null}
      </section>

      {rows.map((r) => (
        <section key={r.id} className="rounded-2xl bg-white/70 p-5 ring-1 ring-line">
          <div className="mb-3 flex items-center gap-2">
            <span className="font-display-ko text-lg font-bold text-pine">
              {displayName(r.data)}
            </span>
            {r.isHead && (
              <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-medium text-moss">
                {ta("householder")}
              </span>
            )}
            {!r.isHead && (
              <button
                type="button"
                onClick={() => removeMember(r.id)}
                disabled={pending}
                className="ml-auto text-xs font-medium text-rose-600 hover:text-rose-700 disabled:opacity-60"
              >
                {t("removeMember")}
              </button>
            )}
          </div>
          <PersonFields
            value={r.data}
            onChange={(p) => patch(r.id, p)}
            groupId={`edit-${r.id}`}
            showContact
          />
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              disabled={pending && savingId === r.id}
              onClick={() => save(r.id, r.data)}
              className="rounded-full bg-pine px-5 py-2 text-sm font-semibold text-ivory transition hover:bg-pine-deep disabled:opacity-60"
            >
              {savingId === r.id ? tc("submitting") : tc("save")}
            </button>
            {savedId === r.id && (
              <span className="text-sm font-medium text-moss">
                {t("updateSuccess")}
              </span>
            )}
            {errorId === r.id && (
              <span className="text-sm text-rose-700">{t("updateError")}</span>
            )}
          </div>
        </section>
      ))}

      {/* 가족 추가 */}
      {adding ? (
        <section className="rounded-2xl bg-white/70 p-5 ring-1 ring-line">
          <p className="mb-3 font-display-ko text-lg font-bold text-pine">
            {t("newMemberTitle")}
          </p>
          <PersonFields
            value={newMember}
            onChange={(p) => setNewMember((prev) => ({ ...prev, ...p }))}
            groupId="new-member"
          />
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={addMember}
              className="rounded-full bg-pine px-5 py-2 text-sm font-semibold text-ivory transition hover:bg-pine-deep disabled:opacity-60"
            >
              {t("saveNewMember")}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setAddError(false);
              }}
              className="text-sm font-medium text-bark-soft hover:text-pine"
            >
              {t("cancel")}
            </button>
            {addError && (
              <span className="text-sm text-rose-700">{t("updateError")}</span>
            )}
          </div>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full rounded-2xl border-2 border-dashed border-line px-5 py-4 text-sm font-medium text-bark-soft transition hover:border-moss hover:text-pine"
        >
          + {t("addMember")}
        </button>
      )}

      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="text-sm font-medium text-bark-soft hover:text-pine"
        >
          {t("signOut")}
        </button>
      </form>
    </div>
  );
}
```

> `emptyPerson`은 `PersonFields.tsx`에서 export됨(확인됨). `paid` prop 제거(더 이상 타입 잠금 없음) — 이에 맞춰 manage 페이지 호출부는 Task 6에서 수정.

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: `manage/page.tsx`에서 `EditForm`에 `paid` prop을 넘기고 있어 **에러 발생 가능** → Task 6에서 함께 수정하므로, 이 단계에선 EditForm만 저장하고 다음 단계에서 manage 페이지를 Task 6과 연동. **여기서는 EditForm 파일 자체의 문법 오류만 없으면 됨** (아래 Step 3에서 확인).

- [ ] **Step 3: EditForm 단독 문법 확인 + Commit (manage 연동은 Task 6)**

Run: `npx tsc --noEmit 2>&1 | grep -v "manage/page" || echo "EditForm OK"`
Expected: `manage/page` 외 다른 에러 없음.

```bash
git add src/components/EditForm.tsx
git commit -m "feat(edit): EditForm 가족 추가/삭제 UI + 정원 경고 (manage 연동은 다음 커밋)"
```

---

### Task 6: 회비 카드 잔액/부족분 결제 + manage 페이지 연동

**Files:**
- Modify: `src/components/HouseholdFeeCard.tsx`
- Modify: `src/app/[locale]/edit/manage/page.tsx`

**Interfaces:**
- Consumes: `my_household_fee()` 새 반환(total/type_selected/paid_total/balance); `buildDonateUrl`; `householdBalance`; `FeePayment`.
- Produces: 잔액 기반 회비 카드 + 부족분 PayPal 링크 + 납입 이력.

- [ ] **Step 1: HouseholdFeeCard 재작성 (잔액/부족분/이력)**

`src/components/HouseholdFeeCard.tsx` 전체 교체:

```tsx
import { useTranslations, useLocale } from "next-intl";
import { formatUSD } from "@/lib/fees";
import type { FeePayment } from "@/lib/types";

export function HouseholdFeeCard({
  total,
  paidTotal,
  balance,
  typeSelected,
  payUrl = null,
  payments = [],
}: {
  total: number;
  paidTotal: number;
  balance: number; // total - paidTotal. 양수=추가납부, 음수=환불
  typeSelected: boolean;
  payUrl?: string | null;
  payments?: FeePayment[];
}) {
  const t = useTranslations("Fee");
  const locale = useLocale();
  const dateFmt = new Intl.DateTimeFormat(
    locale === "en" ? "en-US" : locale === "es" ? "es-ES" : "ko-KR",
    { year: "numeric", month: "short", day: "numeric" },
  );

  const settled = total > 0 && balance <= 0;
  const owe = balance > 0;
  const refund = balance < 0;

  const methodLabel = (m: string | null) => {
    switch (m) {
      case "paypal":
        return t("methodPaypal");
      case "cash":
        return t("methodCash");
      case "check":
        return t("methodCheck");
      case "import":
        return t("methodImport");
      default:
        return m ?? "";
    }
  };

  return (
    <div className="mb-8 rounded-2xl bg-pine p-6 text-ivory ring-1 ring-pine-deep">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ivory/70">{t("total")}</p>
          <p className="font-display mt-1 text-3xl font-bold text-gold">
            {formatUSD(total)}
          </p>
        </div>
        <span
          className={
            settled
              ? "rounded-full bg-gold px-3 py-1 text-sm font-semibold text-pine-deep"
              : "rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-ivory ring-1 ring-ivory/30"
          }
        >
          {settled ? t("paid") : owe ? t("balanceOwe") : t("unpaid")}
        </span>
      </div>

      {!typeSelected && (
        <p className="mt-3 text-xs text-ivory/60">{t("selectTypeNotice")}</p>
      )}

      {owe && (
        <p className="mt-3 text-sm text-ivory/80">
          {t("balanceOwe")}: <span className="font-semibold text-gold">{formatUSD(balance)}</span>
        </p>
      )}

      {refund && (
        <div className="mt-3 rounded-lg bg-white/10 px-4 py-3 text-sm">
          <span className="font-semibold text-gold">
            {t("balanceRefund")}: {formatUSD(-balance)}
          </span>
          <p className="mt-1 text-xs text-ivory/60">{t("balanceRefundNote")}</p>
        </div>
      )}

      {payUrl && owe && (
        <div className="mt-5">
          <a
            href={payUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-full bg-gold px-5 py-3 text-center text-sm font-semibold text-pine-deep transition hover:brightness-105"
          >
            {t("payBalanceWithPaypal", { amount: formatUSD(balance) })}
          </a>
          <p className="mt-2 text-center text-xs text-ivory/60">{t("payNotice")}</p>
        </div>
      )}

      {payments.length > 0 && (
        <div className="mt-5 border-t border-ivory/15 pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ivory/60">
            {t("paymentHistory")}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-ivory/85">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <span>
                  {dateFmt.format(new Date(p.paid_at))}
                  {p.method ? ` · ${methodLabel(p.method)}` : ""}
                </span>
                <span className={p.amount < 0 ? "text-rose-300" : "text-ivory"}>
                  {p.amount < 0 ? `-${formatUSD(-p.amount)}` : formatUSD(p.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: manage 페이지 재작성 (새 fee 필드 + payments 로드 + delta 링크)**

`src/app/[locale]/edit/manage/page.tsx`에서 `fee` 관련 블록을 교체. 구체적으로:

(a) `const fee = feeData as {...}` 타입을 교체:

```ts
  const { data: feeData } = await supabase.rpc("my_household_fee").single();
  const fee = feeData as {
    total: number;
    type_selected: boolean;
    paid_total: number;
    balance: number;
  } | null;
```

(b) `head` 계산 이후, payments 로드 추가:

```ts
  const { data: payData } = head
    ? await supabase
        .from("fee_payments")
        .select("*")
        .eq("head_id", head.id)
        .order("paid_at", { ascending: true })
    : { data: [] as import("@/lib/types").FeePayment[] };
  const payments =
    (payData as import("@/lib/types").FeePayment[] | null) ?? [];
```

(c) payUrl 조건을 balance>0 기반으로, 금액=balance로 교체:

```ts
  let payUrl: string | null = null;
  if (fee && fee.balance > 0 && fee.type_selected && paypalEmail && head) {
    const name =
      head.korean_name?.trim() || head.english_name?.trim() || "";
    const ref = head.district ? `${name} (${head.district})` : name;
    payUrl = buildDonateUrl({
      email: paypalEmail,
      amount: fee.balance,
      itemName: tFee("payItemName"),
      itemNumber: `${tFee("payItemName")} · ${ref}`,
    });
  }
```

(d) `HouseholdFeeCard`/`EditForm` 렌더를 새 props로 교체:

```tsx
      {fee && (
        <HouseholdFeeCard
          total={fee.total}
          paidTotal={fee.paid_total}
          balance={fee.balance}
          typeSelected={fee.type_selected}
          payUrl={payUrl}
          payments={payments}
        />
      )}
      <div className="mt-8">
        <EditForm
          initial={rows}
          roomTypes={roomTypes}
          currentRoomTypeId={currentRoomTypeId}
        />
      </div>
```

> `EditForm`의 `paid` prop 제거(Task 5와 일치). `head`는 이미 `rows.find((a) => a.is_householder)`로 계산됨 — payments 로드는 그 아래에 위치.

- [ ] **Step 3: 타입체크 + 린트 + 빌드**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 에러 없음.

- [ ] **Step 4: 브라우저 수동 검증 (로컬)**

`npm run dev` 후:
1. `/register`로 2인 가구 등록(타입 2인실 선택, 이메일 입력).
2. 로컬 psql로 그 가구주에 납입 1건 삽입:
   `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "insert into fee_payments(head_id, amount, method, paid_at) select id, 600, 'paypal', current_date from attendees where is_householder and email='<이메일>';"`
3. `/edit` → 매직링크(Mailpit http://127.0.0.1:54324) → `/edit/manage`.
4. 확인: 회비 카드에 total $600, 납입 내역 1건($600, PayPal), 배지 "납부 완료".
5. "가족 추가"로 1명 추가 → 카드 total $900, "추가 납부 필요 $300" + PayPal 부족분 링크 표시. 정원 경고("2인실인데 3명") 노출.
6. 추가한 멤버 "삭제" → 확인 다이얼로그 → total $600으로 복귀.

Expected: 위 동작대로 표시/갱신됨.

- [ ] **Step 5: Commit**

```bash
git add src/components/HouseholdFeeCard.tsx "src/app/[locale]/edit/manage/page.tsx"
git commit -m "feat(edit): 회비 카드 잔액·부족분 PayPal 결제·납입 이력 + manage 연동"
```

---

### Task 7: 관리자 납입 서버 액션 (addPayment / deletePayment) + setPaid 제거

**Files:**
- Modify: `src/app/[locale]/admin/actions.ts`

**Interfaces:**
- Consumes: `isAdminSession`, `clean`.
- Produces:
  - `addPayment(input: {headId: string; amount: number; method: string | null; paidAt: string; note?: string | null}): Promise<{ok: boolean; error?: string}>`
  - `deletePayment(id: string): Promise<{ok: boolean}>`
- Removes: `setPaid` (더 이상 사용 안 함 — Task 9에서 호출부 제거).

- [ ] **Step 1: setPaid 제거하고 addPayment/deletePayment 추가**

`src/app/[locale]/admin/actions.ts`에서 기존 `setPaid` 함수(26~33행) 전체를 삭제하고 그 자리에 추가:

```ts
// 회비 납입/환불 1건 기록 (관리자 전용). amount 양수=납입, 음수=환불.
export async function addPayment(input: {
  headId: string;
  amount: number;
  method: string | null;
  paidAt: string; // YYYY-MM-DD
  note?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  if (!(await isAdminSession(supabase))) return { ok: false, error: "notAdmin" };
  if (!Number.isFinite(input.amount) || Math.round(input.amount) === 0) {
    return { ok: false, error: "validationAmount" };
  }
  if (!input.paidAt) return { ok: false, error: "validationDate" };
  const { error } = await supabase.from("fee_payments").insert({
    head_id: input.headId,
    amount: Math.round(input.amount),
    method: clean(input.method),
    note: clean(input.note ?? null),
    paid_at: input.paidAt,
  });
  return error ? { ok: false, error: "paymentError" } : { ok: true };
}

// 납입 기록 삭제 (오기재 정정, 관리자 전용).
export async function deletePayment(id: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  if (!(await isAdminSession(supabase))) return { ok: false };
  const { error } = await supabase.from("fee_payments").delete().eq("id", id);
  return { ok: !error };
}
```

- [ ] **Step 2: 타입체크 (호출부 에러 확인)**

Run: `npx tsc --noEmit 2>&1 | grep -i setpaid || echo "no setPaid refs except table"`
Expected: `AdminAttendeeTable.tsx`가 `setPaid`를 import/호출 중이라 에러 → Task 9에서 제거 예정. **이 태스크는 actions.ts만 커밋**하고 Task 9와 이어서 진행.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/admin/actions.ts"
git commit -m "feat(admin): 회비 납입/환불 기록 액션 addPayment/deletePayment (setPaid 대체)"
```

---

### Task 8: 관리자 납입 관리 페이지 + HouseholdPaymentManager 컴포넌트

**Files:**
- Create: `src/app/[locale]/admin/(protected)/attendees/[headId]/payments/page.tsx`
- Create: `src/components/HouseholdPaymentManager.tsx`

**Interfaces:**
- Consumes: `addPayment`, `deletePayment` (Task 7); RPC `household_total`; `FeePayment`, `PAYMENT_METHODS`; `formatUSD`, `householdBalance`.
- Produces: `/admin/attendees/[headId]/payments` 페이지에서 가구 회비/납입/잔액 관리.

- [ ] **Step 1: 서버 페이지 작성**

Create `src/app/[locale]/admin/(protected)/attendees/[headId]/payments/page.tsx`:

```tsx
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { HouseholdPaymentManager } from "@/components/HouseholdPaymentManager";
import { displayName } from "@/lib/names";
import type { FeePayment } from "@/lib/types";

export default async function HouseholdPaymentsPage({
  params,
}: {
  params: Promise<{ locale: string; headId: string }>;
}) {
  const { locale, headId } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data: head } = await supabase
    .from("attendees")
    .select("id, korean_name, english_name, is_householder")
    .eq("id", headId)
    .single();
  if (!head || !head.is_householder) notFound();

  const [{ data: totalData }, { data: payData }] = await Promise.all([
    supabase.rpc("household_total", { head_id: headId }),
    supabase
      .from("fee_payments")
      .select("*")
      .eq("head_id", headId)
      .order("paid_at", { ascending: true }),
  ]);
  const total = (totalData as number | null) ?? 0;
  const payments = (payData as FeePayment[] | null) ?? [];

  const t = await getTranslations("Admin");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link
        href="/admin/attendees"
        className="text-sm font-medium text-emerald-700 hover:underline"
      >
        ← {t("title")}
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-slate-900">
        {t("paymentsTitle")}
      </h1>
      <p className="mt-1 text-slate-600">{displayName(head)}</p>
      <div className="mt-6">
        <HouseholdPaymentManager
          headId={headId}
          total={total}
          payments={payments}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 클라이언트 컴포넌트 작성**

Create `src/components/HouseholdPaymentManager.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { addPayment, deletePayment } from "@/app/[locale]/admin/actions";
import { formatUSD, householdBalance } from "@/lib/fees";
import { PAYMENT_METHODS, type FeePayment } from "@/lib/types";

const inputClass =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

export function HouseholdPaymentManager({
  headId,
  total,
  payments,
}: {
  headId: string;
  total: number;
  payments: FeePayment[];
}) {
  const t = useTranslations("Admin");
  const tf = useTranslations("Fee");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();

  const paidTotal = payments.reduce((s, p) => s + p.amount, 0);
  const balance = householdBalance(total, paidTotal);

  const dateFmt = new Intl.DateTimeFormat(
    locale === "en" ? "en-US" : locale === "es" ? "es-ES" : "ko-KR",
    { year: "numeric", month: "short", day: "numeric" },
  );

  // 폼 상태. 금액 기본값 = 현재 잔액(양수면 납입 기본).
  const [amount, setAmount] = useState<string>(
    balance > 0 ? String(balance) : "",
  );
  const [method, setMethod] = useState<string>("paypal");
  const [paidAt, setPaidAt] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [error, setError] = useState(false);

  const methodLabel = (m: string) =>
    m === "paypal"
      ? tf("methodPaypal")
      : m === "cash"
        ? tf("methodCash")
        : m === "check"
          ? tf("methodCheck")
          : m === "import"
            ? tf("methodImport")
            : m;

  function submit(sign: 1 | -1) {
    const n = Math.round(Number(amount)) * sign;
    if (!Number.isFinite(n) || n === 0 || !paidAt) {
      setError(true);
      return;
    }
    setError(false);
    start(async () => {
      const r = await addPayment({
        headId,
        amount: n,
        method: method || null,
        paidAt,
        note: note || null,
      });
      if (r.ok) {
        setAmount("");
        setNote("");
        router.refresh();
      } else {
        setError(true);
      }
    });
  }

  function remove(id: string) {
    if (!window.confirm(t("confirmDeletePayment"))) return;
    start(async () => {
      await deletePayment(id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* 요약 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <p className="text-xs text-slate-500">{t("paymentTotal")}</p>
          <p className="mt-1 text-xl font-bold text-slate-900">
            {formatUSD(total)}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <p className="text-xs text-slate-500">{t("paymentPaid")}</p>
          <p className="mt-1 text-xl font-bold text-slate-900">
            {formatUSD(paidTotal)}
          </p>
        </div>
        <div
          className={`rounded-xl p-4 ring-1 ${
            balance > 0
              ? "bg-amber-50 ring-amber-200"
              : balance < 0
                ? "bg-rose-50 ring-rose-200"
                : "bg-emerald-50 ring-emerald-200"
          }`}
        >
          <p className="text-xs text-slate-500">{t("paymentBalance")}</p>
          <p
            className={`mt-1 text-xl font-bold ${
              balance > 0
                ? "text-amber-800"
                : balance < 0
                  ? "text-rose-700"
                  : "text-emerald-700"
            }`}
          >
            {balance < 0 ? `-${formatUSD(-balance)}` : formatUSD(balance)}
          </p>
        </div>
      </div>

      {/* 납입 내역 */}
      <div className="rounded-xl ring-1 ring-slate-200">
        <p className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("paymentListTitle")}
        </p>
        {payments.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500">{t("paymentEmpty")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {payments.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
              >
                <span className="text-slate-600">
                  {dateFmt.format(new Date(p.paid_at))}
                  {p.method ? ` · ${methodLabel(p.method)}` : ""}
                  {p.note ? ` · ${p.note}` : ""}
                </span>
                <span className="flex items-center gap-3">
                  <span
                    className={
                      p.amount < 0
                        ? "font-medium text-rose-700"
                        : "font-medium text-slate-900"
                    }
                  >
                    {p.amount < 0
                      ? `-${formatUSD(-p.amount)}`
                      : formatUSD(p.amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    disabled={pending}
                    className="text-xs text-slate-400 hover:text-rose-600 disabled:opacity-60"
                  >
                    {t("deletePayment")}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 기록 폼 */}
      <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              {t("paymentAmount")}
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              {t("paymentMethod")}
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className={inputClass}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {methodLabel(m)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              {t("paymentDate")}
            </label>
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              {t("paymentNote")}
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => submit(1)}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {t("recordPayment")}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => submit(-1)}
            className="rounded-lg bg-rose-100 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-200 disabled:opacity-60"
          >
            {t("recordRefund")}
          </button>
          {error && (
            <span className="text-sm text-rose-700">{t("paymentError")}</span>
          )}
        </div>
      </div>
    </div>
  );
}
```

> `displayName`은 `head`처럼 `{korean_name, english_name}`를 받으므로 서버 페이지에서 그대로 사용 가능.
> `notFound`는 `next/navigation`에서 import (locale 무관 표준 API).

- [ ] **Step 3: 타입체크 + 린트**

Run: `npx tsc --noEmit 2>&1 | grep -v "AdminAttendeeTable\|setPaid" ; npm run lint`
Expected: 신규 파일 관련 에러 없음(테이블의 setPaid 잔여 에러는 Task 9에서 해소).

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/admin/(protected)/attendees/[headId]/payments/page.tsx" src/components/HouseholdPaymentManager.tsx
git commit -m "feat(admin): 가구 납입 관리 페이지 + HouseholdPaymentManager (납입/환불 기록·이력)"
```

---

### Task 9: 관리자 참석자 목록 — 잔액 배지 + 납입 관리 링크 (paid 토글 제거)

**Files:**
- Modify: `src/components/AdminAttendeeTable.tsx`
- Modify: `src/app/[locale]/admin/(protected)/attendees/page.tsx`

**Interfaces:**
- Consumes: `paidByHead`, `householdBalance`, `groupHouseholds`; `FeePayment`.
- Produces: 목록에 가구별 잔액 표시 + 납입 관리 페이지 링크. `setPaid` 참조 제거.

- [ ] **Step 1: attendees 페이지에서 payments 로드 후 map 전달**

`src/app/[locale]/admin/(protected)/attendees/page.tsx`의 attendees 쿼리 직후에 payments 로드 추가하고, 컴포넌트에 `paidByHead` prop 전달. 구체 변경:

`import` 라인에 추가:
```ts
import { groupHouseholds, withHouseholdRoomType, paidByHead, householdBalance, type AttendeeWithRoom } from "@/lib/fees";
```

attendees 계산 뒤에 추가:
```ts
  const { data: payData } = await supabase
    .from("fee_payments")
    .select("head_id, amount");
  const paid = paidByHead(
    (payData as { head_id: string; amount: number }[] | null) ?? [],
  );
  // 요약 통계: 수납 합계 + 정산 가구 수
  const collected = [...paid.values()].reduce((s, v) => s + v, 0);
  const settledHouseholds = households.filter(
    (h) => h.total > 0 && householdBalance(h.total, paid.get(h.head.id) ?? 0) <= 0,
  ).length;
```

기존 `const paidHouseholds = households.filter((h) => h.head.paid).length;` 줄을 삭제하고, 상단 통계 표시를 교체:
```tsx
      <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-600">
        <span>{t("total", { count: attendees.length })}</span>
        <span>·</span>
        <span>{t("dashSettledHouseholds")}: {settledHouseholds}/{households.length}</span>
        <span>·</span>
        <span>${collected.toLocaleString("en-US")} / ${grandTotal.toLocaleString("en-US")}</span>
      </div>
```

`AdminAttendeeTable` 렌더에 prop 추가:
```tsx
        <AdminAttendeeTable
          attendees={attendees}
          paidByHead={Object.fromEntries(paid)}
        />
```

- [ ] **Step 2: AdminAttendeeTable — setPaid 제거, 잔액 배지 + 링크**

`src/components/AdminAttendeeTable.tsx` 변경:

(a) import에서 `setPaid` 제거:
```ts
import { setLanguage } from "@/app/[locale]/admin/actions";
```

(b) `import { personFee, formatUSD, groupHouseholds, type AttendeeWithRoom } from "@/lib/fees";` 를 교체:
```ts
import {
  personFee,
  formatUSD,
  groupHouseholds,
  householdBalance,
  type AttendeeWithRoom,
} from "@/lib/fees";
```

(c) 컴포넌트 시그니처 + prop:
```tsx
export function AdminAttendeeTable({
  attendees,
  paidByHead,
}: {
  attendees: AttendeeWithRoom[];
  paidByHead: Record<string, number>;
}) {
```

(d) 컴포넌트 내부에서 `togglePaid` 함수와 `busy`/`setPaid` 관련 상태·`paidButton` 함수를 **삭제**하고, 대신 가구별 총액 맵과 잔액 배지 헬퍼를 추가 (컴포넌트 상단, `feeText` 근처):
```tsx
  const totalByHead = new Map(
    groupHouseholds(attendees).map((h) => [h.head.id, h.total]),
  );

  function balanceBadge(headId: string) {
    const total = totalByHead.get(headId) ?? 0;
    const paid = paidByHead[headId] ?? 0;
    const bal = householdBalance(total, paid);
    const cls =
      bal > 0
        ? "bg-amber-100 text-amber-800"
        : bal < 0
          ? "bg-rose-100 text-rose-700"
          : "bg-emerald-100 text-emerald-700";
    const label =
      bal > 0
        ? t("balanceOwe", { amount: formatUSD(bal) })
        : bal < 0
          ? t("balanceRefund", { amount: formatUSD(-bal) })
          : t("balanceSettled");
    return (
      <Link
        href={`/admin/attendees/${headId}/payments`}
        className={`inline-block rounded-full px-3 py-1 text-xs font-medium hover:brightness-95 ${cls}`}
      >
        {label}
      </Link>
    );
  }
```

> `busy`/`setBusy` state가 다른 곳에서 안 쓰이면 그 `useState`도 제거. `useTransition`의 `start`는 `changeLang`에서 계속 사용.

(e) 그룹 보기 헤더의 `{paidButton(h.head.id, h.head.paid)}` (약 286행)를 교체:
```tsx
                          {balanceBadge(h.head.id)}
```

(f) 리스트 보기 헤더의 `colPaid`/`colPayment` 두 th를 하나의 `colBalance`로 교체. 기존:
```tsx
              <th className="px-3 py-2 text-right font-medium">{t("colPaid")}</th>
              <th className="px-3 py-2 text-left font-medium">
                {t("colPayment")}
              </th>
```
교체:
```tsx
              <th className="px-3 py-2 text-left font-medium">
                {t("colBalance")}
              </th>
```
그리고 리스트 보기 tbody의 해당 행(약 366~387행)에서 `headPaid` 계산과 `<td ...>{paidButton(headId, headPaid)}</td>`, 그리고 그 다음의 등록일 td 구성을 교체:
```tsx
            {rows.map((a) => {
              const head = headOf(a, heads);
              const headId = head?.id ?? a.id;
              return (
                <tr key={a.id}>
                  <td className="px-3 py-2">{nameLink(a)}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {displayName(head ?? a)}
                    {a.is_householder && (
                      <span className="ml-1 text-xs text-slate-400">
                        ({t("householder")})
                      </span>
                    )}
                  </td>
                  {personCells(a)}
                  <td className="px-3 py-2">
                    {a.is_householder ? balanceBadge(headId) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                    {dateFmt.format(new Date(a.created_at))}
                  </td>
                </tr>
              );
            })}
```

> 리스트 보기에서 잔액은 **가구주 행에만** 표시(가구 단위 값). 헤더 컬럼 수(10 → 9)가 body와 일치하는지 확인: Name, Household, Role, District, Attendance, Room, Language, Balance, Registered = 9. body: name + household + personCells(6) + balance + date = 9. ✓ 리스트 보기 thead의 컬럼도 위 교체로 9개가 됨(colPaid+colPayment 2개 → colBalance 1개).

- [ ] **Step 3: 타입체크 + 린트 + 빌드**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 에러 없음 (setPaid 참조 완전 제거됨).

- [ ] **Step 4: 브라우저 수동 검증**

`npm run dev`, 관리자 Google 로그인 후 `/admin/attendees`:
1. 그룹 보기: 각 가구 헤더에 잔액 배지(정산/추가납부/환불) 표시, 클릭 시 `/admin/attendees/<headId>/payments` 이동.
2. 납입 관리 페이지: 요약(가구 회비/납입 합계/잔액), 납입 내역, "납입 기록"으로 $200 추가 → 잔액 감소, 목록에 반영. "환불 기록"으로 음수 기록 → 잔액 증가(환불). 삭제 동작 확인.
3. 리스트 보기: 가구주 행에 잔액 배지 표시.

Expected: 위 동작대로.

- [ ] **Step 5: Commit**

```bash
git add src/components/AdminAttendeeTable.tsx "src/app/[locale]/admin/(protected)/attendees/page.tsx"
git commit -m "feat(admin): 참석자 목록 잔액 배지 + 납입 관리 링크 (paid 토글 제거)"
```

---

### Task 10: 대시보드 회비 집계 — 원장 기반 (수납/미납/환불/정산)

**Files:**
- Modify: `src/lib/dashboard.ts`
- Modify: `src/components/AdminDashboard.tsx`
- Modify: `src/app/[locale]/admin/(protected)/page.tsx`

**Interfaces:**
- Consumes: `paidByHead`, `householdBalance`.
- Produces: `DashboardStats`에 `collected/outstanding/refundDue/settledHouseholds` (기존 `paidTotal/unpaidTotal/paidHouseholds` 대체).

- [ ] **Step 1: computeDashboard 원장 기반 재작성**

`src/lib/dashboard.ts` 변경:

(a) import 교체:
```ts
import {
  groupHouseholds,
  withHouseholdRoomType,
  householdBalance,
  type AttendeeWithRoom,
} from "./fees";
```

(b) `DashboardStats`의 회비 필드 교체:
```ts
  grandTotal: number;
  collected: number; // 수납 합계(net, 환불 반영)
  outstanding: number; // 미납 합계 Σmax(0, balance)
  refundDue: number; // 환불 필요 합계 Σmax(0, -balance)
  settledHouseholds: number; // 정산 완료(total>0 && balance<=0) 가구 수
```
(기존 `paidTotal/unpaidTotal/paidHouseholds` 삭제)

(c) 시그니처에 `paidByHead: Map<string, number>` 추가:
```ts
export function computeDashboard(
  attendees: AttendeeWithRoom[],
  rooms: RoomForStats[],
  paid: Map<string, number>,
): DashboardStats {
```

(d) 기존 `paidTotal` 계산 블록(48~50행)을 교체:
```ts
  const grandTotal = households.reduce((s, h) => s + h.total, 0);
  let collected = 0;
  let outstanding = 0;
  let refundDue = 0;
  let settledHouseholds = 0;
  for (const h of households) {
    const p = paid.get(h.head.id) ?? 0;
    const bal = householdBalance(h.total, p);
    collected += p;
    if (bal > 0) outstanding += bal;
    if (bal < 0) refundDue += -bal;
    if (h.total > 0 && bal <= 0) settledHouseholds += 1;
  }
```

(e) return 객체의 회비 필드 교체:
```ts
    grandTotal,
    collected,
    outstanding,
    refundDue,
    settledHouseholds,
```

- [ ] **Step 2: 대시보드 페이지에서 payments 로드 후 전달**

`src/app/[locale]/admin/(protected)/page.tsx`:

(a) import 추가:
```ts
import { paidByHead } from "@/lib/fees";
```

(b) `Promise.all` 배열에 payments 쿼리 추가하고 destructure:
```ts
  const [{ data: aData }, { data: rData }, { count: reqCount }, { data: payData }] =
    await Promise.all([
      supabase
        .from("attendees")
        .select(
          "*, rooms(label, room_types(name, price_per_person)), requested_room_type:room_types!requested_room_type_id(name, price_per_person)",
        ),
      supabase.from("rooms").select("room_types(name, capacity)"),
      supabase
        .from("email_requests")
        .select("id", { count: "exact", head: true })
        .eq("processed", false),
      supabase.from("fee_payments").select("head_id, amount"),
    ]);
```

(c) `computeDashboard` 호출에 map 전달:
```ts
  const stats = computeDashboard(
    (aData as AttendeeWithRoom[] | null) ?? [],
    (rData as RoomForStats[] | null) ?? [],
    paidByHead(
      (payData as { head_id: string; amount: number }[] | null) ?? [],
    ),
  );
```

- [ ] **Step 3: AdminDashboard 회비 카드 갱신**

`src/components/AdminDashboard.tsx`의 회비 현황 Card(165~189행) 내부를 교체:
```tsx
        {/* 회비 현황 */}
        <Card tone="amber" title={t("dashFees")}>
          <p className="text-3xl font-bold text-amber-800">
            {formatUSD(stats.collected)}
          </p>
          <p className="mt-1 text-sm text-amber-700">
            / {formatUSD(stats.grandTotal)} {t("dashExpected")}
          </p>
          <div className="mt-2">
            <Bar value={stats.collected} total={stats.grandTotal} tone="amber" />
          </div>
          <div className="mt-3 flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm">
            <span className="text-amber-700">
              {t("dashOutstanding")}{" "}
              <span className="font-medium text-amber-900">
                {formatUSD(stats.outstanding)}
              </span>
            </span>
            {stats.refundDue > 0 && (
              <span className="text-rose-700">
                {t("dashRefundDue")}{" "}
                <span className="font-medium text-rose-900">
                  {formatUSD(stats.refundDue)}
                </span>
              </span>
            )}
            <span className="text-amber-700">
              {t("dashSettledHouseholds")}{" "}
              <span className="font-medium text-amber-900">
                {stats.settledHouseholds}/{stats.households}
              </span>
            </span>
          </div>
        </Card>
```

- [ ] **Step 4: 타입체크 + 린트 + 빌드**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 에러 없음.

- [ ] **Step 5: 브라우저 수동 검증**

`/admin` 대시보드: 회비 카드에 수납/총예상, 미납, (환불 필요 시)환불, 정산 가구 수가 원장 기준으로 표시.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dashboard.ts src/components/AdminDashboard.tsx "src/app/[locale]/admin/(protected)/page.tsx"
git commit -m "feat(admin): 대시보드 회비 집계 원장 기반(수납/미납/환불/정산)"
```

---

### Task 11: 전체 검증 — 빌드 + 김진욱 시나리오 E2E

**Files:** (없음 — 검증 전용)

- [ ] **Step 1: 전체 정적 검증**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 세 명령 모두 에러 없이 통과.

- [ ] **Step 2: 김진욱 시나리오 E2E (로컬)**

`supabase db reset && npm run dev` 후 브라우저로:
1. `/register`: 김진욱 + 와이프(2인 가구), 2인실 선택, 이메일 등록 → 성공.
2. 관리자 로그인 → `/admin/attendees` → 김진욱 가구 배지 "추가 납부 $600"(미납). 배지 클릭 → 납입 관리.
3. 납입 관리: 금액 600, 수단 PayPal, 날짜 6/10 → "납입 기록" → 잔액 $0, 내역 1건.
4. 성도로 `/edit/manage`(매직링크): 카드 "납부 완료", 내역 $600.
5. "가족 추가" ×2(아들·딸) → 카드 total 계산 갱신, "추가 납부 필요". 객실 타입 4인실로 변경 → total $800, 잔액 $200, 부족분 PayPal 링크 $200, 정원 경고 해소(4인실=4명).
6. 관리자 납입 관리: 금액 200, PayPal, 6/13 → 잔액 $0, 내역 2건($600·$200).
7. 성도가 자녀 1명 삭제 → total $600, 잔액 -$200(환불) → 카드 "환불 예정 $200". 관리자 목록 배지 "환불 $200".
8. 관리자 "환불 기록" $200(6/15) → 잔액 $0.
9. 대시보드 회비 카드 수치가 원장과 일치.

Expected: 각 단계가 설계대로 동작. (현금 납입은 3단계에서 수단 '현금' 선택으로 동일 검증)

- [ ] **Step 3: 최종 커밋 (필요 시)**

검증 중 수정이 있으면 커밋. 없으면 생략.

```bash
git status
```

---

## 자기 검토 결과 (작성자)

- **Spec coverage**: 멤버 추가(T4/5)·삭제(T1 RPC/T4/5)·타입 변경 잠금 해제(T1/4/5)·부족분 계산+PayPal delta(T2/6)·환불 표시(T6)·관리자 납입 이력+기록(T7/8)·잔액 노출(T9)·대시보드(T10)·정원 경고(T5)·i18n(T3)·백필(T1) — 모두 태스크로 매핑됨.
- **Placeholder scan**: 모든 코드 스텝에 실제 코드/명령/기대출력 포함. TBD 없음.
- **Type consistency**: `my_household_fee` 반환(total/type_selected/paid_total/balance)은 T1 SQL·T6 소비 일치. `addPayment` 시그니처는 T7 정의·T8 호출 일치. `paidByHead`(Map)·`householdBalance`는 T2 정의·T9/T10 소비 일치. `AdminAttendeeTable` prop `paidByHead: Record<string,number>`는 T9 페이지(`Object.fromEntries`)·컴포넌트 일치.
```
