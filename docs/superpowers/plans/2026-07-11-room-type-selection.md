# 성도 객실 타입 선택 + 선택 기반 회비 + PayPal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 성도가 등록·수정 시 원하는 객실 타입(가구 단위)을 선택하고, 그 선택에서 회비를 산정해 PayPal로 낼 수 있게 한다. 회비 소스를 관리자 방 배정에서 성도 선택으로 전환한다.

**Architecture:** `attendees.requested_room_type_id`(가구주 행) 신설 + `room_types` 공개읽기. 회비 계산(`lib/fees.ts`·`my_household_fee` RPC·대시보드)을 선택 기반으로 전환. 물리적 방 배정(`room_id`)은 로지스틱스로 유지(회비와 분리). PayPal 링크는 기배포된 `buildDonateUrl` 재사용, amount만 선택 기반.

**Tech Stack:** Next.js 16 App Router(서버 컴포넌트/액션), Supabase(Postgres+RLS), next-intl v4, TypeScript.

## Global Constraints

- Next 16: 서버 액션으로 mutation, `useTranslations`/`getTranslations`는 콜백 밖 상단에서.
- i18n 3파일 동기화(`messages/{ko,en,es}.json`), 같은 키. DB enum/데이터는 번역 안 함.
- 프로젝트에 테스트 프레임워크 없음 → 검증 = `npx tsc --noEmit` + `npx eslint` + `npx tsx` 어서션 + psql + 브라우저.
- 선택 단위 = **가구**. `requested_room_type_id`는 **가구주(head) 행**에 저장, 6세 이상 가족 전체에 적용.
- 회비 = 6세미만 $0; 아니면 head 선택 타입 `price_per_person`; 미선택이면 미산정.
- `requested_room_type_id`는 **성도 수정 가능**(guard 트리거 관리자전용 목록에 넣지 않음).
- 물리적 방 배정(`room_id`)·정원 경고는 그대로. 바뀌는 건 **회비 금액 소스**뿐.
- paid=true면 타입 선택 잠금(UI 읽기전용 + 서버 액션 거부).
- 재고/정원 제한 없음(선택=희망). 결제 자동대조 없음(관리자 수동 paid 유지).
- ⚠️ 마이그레이션 0018은 **사용자가 직접 프로덕션 `supabase db push`**(코드 병합보다 먼저). 구현·검증은 로컬에서.

## 공용 쿼리 조각 (여러 태스크에서 사용)

attendees 조회 시 head의 선택 타입을 임베드:
```
*, rooms(label, room_types(name, price_per_person)), requested_room_type:room_types!requested_room_type_id(name, price_per_person)
```
- `rooms(...)` = 물리적 배정(기존 유지). `requested_room_type:...!requested_room_type_id` = 선택 타입(신규, head 행만 채워짐).

---

### Task 1: 마이그레이션 0018 (컬럼 + 공개읽기 RLS + RPC 재작성)

**Files:**
- Create: `supabase/migrations/0018_requested_room_type.sql`

**Interfaces:**
- Produces: `attendees.requested_room_type_id uuid`; `room_types` 공개 SELECT; `my_household_fee()` 반환 `(total int, type_selected boolean, paid boolean)`.

- [ ] **Step 1: 마이그레이션 파일 작성**

`supabase/migrations/0018_requested_room_type.sql`:

```sql
-- 성도가 선택한 객실 타입(가구 단위, 가구주 행에 저장) → 회비 산정 소스.
alter table public.attendees
  add column requested_room_type_id uuid
    references public.room_types(id) on delete set null;
create index attendees_requested_room_type_idx
  on public.attendees(requested_room_type_id);

-- room_types 공개 읽기(가격은 공개 정보; 선택 UI가 타입 목록을 불러오려면 필요).
-- rooms(물리적 호실)은 계속 관리자 전용.
create policy "room_types_public_read" on public.room_types
  for select to anon, authenticated using (true);

-- 회비 RPC: 물리적 배정(room_id) → 가구주 선택(requested_room_type_id) 기반으로 재작성.
create or replace function public.my_household_fee()
returns table (total int, type_selected boolean, paid boolean)
language sql stable security definer set search_path = public as $$
  with mine as (
    select a.* from public.attendees a
    where a.id in (select public.my_attendee_ids())
       or a.householder_id in (select public.my_attendee_ids())
  ),
  head as (
    select requested_room_type_id, paid
    from mine where is_householder limit 1
  )
  select
    (coalesce(
      (select price_per_person from public.room_types
        where id = (select requested_room_type_id from head)), 0)
     * (select count(*) from mine m where not m.is_under_6))::int as total,
    (select requested_room_type_id from head) is not null as type_selected,
    coalesce((select paid from head), false) as paid;
$$;
grant execute on function public.my_household_fee to authenticated;
```

- [ ] **Step 2: 로컬 적용 + 스키마 확인**

Run:
```bash
supabase migration up
```
Expected: 0018 적용 성공.

- [ ] **Step 3: RPC 시나리오 psql 검증**

로컬 DB에 가구(가구주+가족) 시드 후 세션 클레임으로 RPC 확인. Run:
```bash
docker exec -i supabase_db_retreat2026 psql -U postgres -d postgres <<'SQL'
insert into public.room_types (name, capacity, price_per_person, sort_order)
  values ('T2', 2, 300, 90) on conflict do nothing;
insert into public.attendees (id, korean_name, is_householder, email, householder_id, requested_room_type_id)
  select '77777777-7777-7777-7777-777777777777','타입선택가구주', true, 'rthead@example.com', null,
         (select id from public.room_types where name='T2' limit 1);
insert into public.attendees (id, korean_name, is_householder, email, householder_id)
  values ('88888888-8888-8888-8888-888888888888','자녀', false, null, '77777777-7777-7777-7777-777777777777'),
         ('99999999-9999-9999-9999-999999999999','유아', false, null, '77777777-7777-7777-7777-777777777777');
update public.attendees set is_under_6=true where id='99999999-9999-9999-9999-999999999999';
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"email":"rthead@example.com"}',true);
select * from public.my_household_fee();  -- 기대: total=600(300*2, 유아 제외), type_selected=t, paid=f
commit;
delete from public.attendees where id in ('77777777-7777-7777-7777-777777777777','88888888-8888-8888-8888-888888888888','99999999-9999-9999-9999-999999999999');
delete from public.room_types where name='T2';
SQL
```
Expected: `total=600, type_selected=t, paid=f`.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/0018_requested_room_type.sql
git commit -m "feat(db): requested_room_type_id + room_types 공개읽기 + my_household_fee 선택기반(0018)"
```

---

### Task 2: i18n 메시지 (객실 타입 선택 관련)

**Files:**
- Modify: `messages/ko.json`, `messages/en.json`, `messages/es.json`

**Interfaces:**
- Produces: `Fee.roomType`(라벨), `Fee.roomTypePlaceholder`(미선택 옵션), `Fee.roomTypeOption`(옵션 포맷 `{name} · {price}/{per}` → per=perPerson 기존키 재사용), `Fee.selectTypeNotice`(미선택 안내), `Fee.perPersonSuffix`(옵션용 "/인"). 후속 태스크(3·5·6·7)가 소비.

- [ ] **Step 1: ko.json `Fee`에 키 추가** (`payItemName` 뒤에 콤마 + 추가)

```json
    "payItemName": "늘푸른교회 2026 수련회 회비",
    "roomType": "객실 타입",
    "roomTypePlaceholder": "선택 안 함",
    "perPersonSuffix": "/인",
    "selectTypeNotice": "객실 타입을 선택하면 회비가 산정됩니다.",
    "roomTypeLockedNote": "납부 완료되어 변경할 수 없습니다."
```

- [ ] **Step 2: en.json `Fee`에 키 추가**

```json
    "payItemName": "Evergreen Church 2026 Retreat Fee",
    "roomType": "Room type",
    "roomTypePlaceholder": "Not selected",
    "perPersonSuffix": "/person",
    "selectTypeNotice": "Select a room type to see your fee.",
    "roomTypeLockedNote": "Paid — this can no longer be changed."
```

- [ ] **Step 3: es.json `Fee`에 키 추가**

```json
    "payItemName": "Cuota del Retiro 2026 de la Iglesia Evergreen",
    "roomType": "Tipo de habitación",
    "roomTypePlaceholder": "Sin seleccionar",
    "perPersonSuffix": "/persona",
    "selectTypeNotice": "Seleccione un tipo de habitación para ver su cuota.",
    "roomTypeLockedNote": "Pagado — ya no se puede cambiar."
```

- [ ] **Step 4: JSON 유효성 + parity 확인**

Run:
```bash
node -e "['ko','en','es'].forEach(f=>{const F=require('./messages/'+f+'.json').Fee;JSON.parse(require('fs').readFileSync('messages/'+f+'.json','utf8'));console.log(f,Object.keys(F).sort().join(','))})"
```
Expected: 세 줄의 키 목록이 동일하고 새 키(roomType/roomTypePlaceholder/perPersonSuffix/selectTypeNotice/roomTypeLockedNote) 포함.

- [ ] **Step 5: 커밋**

```bash
git add messages/ko.json messages/en.json messages/es.json
git commit -m "feat(i18n): 객실 타입 선택·미선택 안내 문구(ko/en/es)"
```

---

### Task 3: fees.ts + dashboard.ts 선택 기반 전환

**Files:**
- Modify: `src/lib/fees.ts`
- Modify: `src/lib/dashboard.ts`
- Test(임시): `scratchpad/fees-check.mts`

**Interfaces:**
- Consumes: `Attendee`(`@/lib/types`).
- Produces:
  - `AttendeeWithRoom`에 `requested_room_type?: { name: string; price_per_person: number } | null` 추가.
  - `personFee(a)` = 6세미만 $0, 아니면 `a.requested_room_type?.price_per_person ?? null`(미선택 null).
  - `withHouseholdRoomType(rows): AttendeeWithRoom[]` — 각 행의 `requested_room_type`를 그 가구 head 값으로 채움(가구원 포함). 관리자 회비 경로에서 전처리로 사용.
  - `groupHouseholds` 그대로 personFee 합산; `unassignedCount` 의미 = 회비 미산정 인원(head 미선택 시 가구 내 6세이상 수, 선택 시 0).

- [ ] **Step 1: `src/lib/fees.ts` 교체**

```ts
import type { Attendee } from "./types";

// Supabase 중첩 select 결과 형태.
// rooms = 물리적 배정(로지스틱스), requested_room_type = 성도 선택(회비 소스, head 행).
export type RoomTypeLite = { name: string; price_per_person: number };
export type AttendeeWithRoom = Attendee & {
  rooms:
    | {
        label: string;
        room_types: RoomTypeLite | null;
      }
    | null;
  requested_room_type?: RoomTypeLite | null;
};

export interface Household {
  head: AttendeeWithRoom;
  members: AttendeeWithRoom[]; // head 제외 가족
  total: number; // 가구 회비 합계(선택 타입 기준)
  unassignedCount: number; // 6세 미만 아닌데 회비 미산정(타입 미선택)인 인원
}

// 사람별 회비: 6세미만=0, 미선택=null, 그 외=가구주 선택 타입 단가.
// (requested_room_type는 withHouseholdRoomType로 가구원 행에도 채워져 있어야 정확)
export function personFee(a: AttendeeWithRoom): number | null {
  if (a.is_under_6) return 0;
  const price = a.requested_room_type?.price_per_person;
  return price == null ? null : price;
}

export function formatUSD(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

// 각 행의 requested_room_type를 그 가구 가구주(head)의 값으로 채운다.
// (Supabase 임베드는 head 행에만 값을 주므로, 가구원 회비 계산 위해 전파)
export function withHouseholdRoomType(
  rows: AttendeeWithRoom[],
): AttendeeWithRoom[] {
  const headType = new Map<string, RoomTypeLite | null>();
  for (const r of rows) {
    if (r.is_householder) headType.set(r.id, r.requested_room_type ?? null);
  }
  return rows.map((r) => {
    const hid = r.is_householder ? r.id : r.householder_id;
    return {
      ...r,
      requested_room_type: (hid ? headType.get(hid) : null) ?? null,
    };
  });
}

// 전체 참석자를 가구(head + members)로 묶고 합계 계산.
// 입력 rows는 withHouseholdRoomType로 전처리돼 있어야 한다.
export function groupHouseholds(rows: AttendeeWithRoom[]): Household[] {
  const heads = rows.filter((r) => r.is_householder);
  const byHead = new Map<string, AttendeeWithRoom[]>();
  for (const r of rows) {
    if (r.householder_id) {
      const list = byHead.get(r.householder_id) ?? [];
      list.push(r);
      byHead.set(r.householder_id, list);
    }
  }
  return heads.map((head) => {
    const members = byHead.get(head.id) ?? [];
    const people = [head, ...members];
    const total = people.reduce((sum, p) => sum + (personFee(p) ?? 0), 0);
    const unassignedCount = people.filter(
      (p) => !p.is_under_6 && personFee(p) == null,
    ).length;
    return { head, members, total, unassignedCount };
  });
}
```

- [ ] **Step 2: `src/lib/dashboard.ts` — 회비 집계를 전처리 rows로**

`computeDashboard` 시작부에서 fee 계산용 households를 전처리된 rows로 만든다.
`const households = groupHouseholds(attendees);` 줄을 아래로 교체:

```ts
  const households = groupHouseholds(withHouseholdRoomType(attendees));
```

그리고 import 줄을 아래로 교체:

```ts
import {
  groupHouseholds,
  withHouseholdRoomType,
  type AttendeeWithRoom,
} from "./fees";
```

(주의: 물리적 방 점유 통계(`assigned`/`unassigned`/`rooms`)는 `a.room_id`·`a.rooms` 기준 그대로 — 변경 없음.)

- [ ] **Step 3: 어서션 스크립트 작성 → 실패 확인**

`scratchpad/fees-check.mts`:

```ts
import assert from "node:assert/strict";
import { personFee, groupHouseholds, withHouseholdRoomType } from "../src/lib/fees.ts";

const base = {
  district: null, gender: null, role: "member", retreat_group: null,
  is_group_leader: false, note: null, email: null, phone: null, room_id: null,
  language: "ko", attendance: "full", arrival_at: null, departure_at: null,
  paid: false, paid_at: null, created_at: "2026-01-01", updated_at: "2026-01-01",
  rooms: null, english_name: null,
} as const;

const head = { ...base, id: "h", korean_name: "H", is_householder: true, householder_id: null, is_under_6: false, requested_room_type: { name: "2인실", price_per_person: 300 } };
const child = { ...base, id: "c", korean_name: "C", is_householder: false, householder_id: "h", is_under_6: false };
const baby = { ...base, id: "b", korean_name: "B", is_householder: false, householder_id: "h", is_under_6: true };

const rows = withHouseholdRoomType([head as any, child as any, baby as any]);
// 가구원에게도 head 타입 전파
assert.equal(rows.find(r => r.id === "c")!.requested_room_type?.price_per_person, 300);
assert.equal(personFee(rows.find(r => r.id === "c")!), 300);
assert.equal(personFee(rows.find(r => r.id === "b")!), 0); // 6세미만
const hh = groupHouseholds(rows);
assert.equal(hh.length, 1);
assert.equal(hh[0].total, 600);          // 300*2 (유아 제외)
assert.equal(hh[0].unassignedCount, 0);

// 미선택 가구
const head2 = { ...base, id: "h2", korean_name: "H2", is_householder: true, householder_id: null, is_under_6: false };
const rows2 = withHouseholdRoomType([head2 as any]);
assert.equal(personFee(rows2[0]), null);
const hh2 = groupHouseholds(rows2);
assert.equal(hh2[0].total, 0);
assert.equal(hh2[0].unassignedCount, 1);

console.log("OK: fees selection-based assertions passed");
```

Run: `npx tsx scratchpad/fees-check.mts`
Expected: FAIL (withHouseholdRoomType/새 필드 미구현 시) — 구현 전이면 import/타입 에러.

> 순서상 Step 1·2를 먼저 구현했으므로, 이 스텝은 스크립트 작성 후 바로 Step 4로 실행. (RED는 스크립트를 Step 1 이전에 두지 않고, 새 export 부재를 확인하는 용도 — 이미 구현돼 있으면 GREEN으로 진행.)

- [ ] **Step 4: 어서션 통과 + 타입체크**

Run: `npx tsx scratchpad/fees-check.mts && npx tsc --noEmit`
Expected: `OK: fees selection-based assertions passed` + tsc 에러 없음.

- [ ] **Step 5: 커밋** (scratchpad는 repo 밖/gitignore → 스테이징 안 됨)

```bash
git add src/lib/fees.ts src/lib/dashboard.ts
git commit -m "feat(fees): 회비 계산을 선택 타입 기반으로 전환(withHouseholdRoomType)"
```

---

### Task 4: RoomTypeSelect 공용 컴포넌트

**Files:**
- Create: `src/components/RoomTypeSelect.tsx`

**Interfaces:**
- Consumes: `RoomType`(`@/lib/types`), `formatUSD`(`@/lib/fees`), i18n `Fee`(Task 2).
- Produces: `RoomTypeSelect` (client) — props `{ roomTypes: RoomType[]; value: string; onChange: (id: string) => void; disabled?: boolean; className?: string }`. `value=""`는 미선택. 옵션 라벨 = `"{name} · {formatUSD(price)}{perPersonSuffix}"`.

- [ ] **Step 1: 컴포넌트 작성**

`src/components/RoomTypeSelect.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import type { RoomType } from "@/lib/types";
import { formatUSD } from "@/lib/fees";

export function RoomTypeSelect({
  roomTypes,
  value,
  onChange,
  disabled = false,
  className,
}: {
  roomTypes: RoomType[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations("Fee");
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={className}
    >
      <option value="">{t("roomTypePlaceholder")}</option>
      {roomTypes.map((rt) => (
        <option key={rt.id} value={rt.id}>
          {rt.name} · {formatUSD(rt.price_per_person)}
          {t("perPersonSuffix")}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: 타입체크 + 린트**

Run: `npx tsc --noEmit && npx eslint src/components/RoomTypeSelect.tsx`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add src/components/RoomTypeSelect.tsx
git commit -m "feat(rooms): 객실 타입 선택 공용 컴포넌트 RoomTypeSelect"
```

---

### Task 5: 등록 폼에서 객실 타입 선택

**Files:**
- Modify: `src/app/[locale]/register/page.tsx`
- Modify: `src/app/[locale]/register/actions.ts`
- Modify: `src/components/RegistrationForm.tsx`

**Interfaces:**
- Consumes: `RoomTypeSelect`(Task 4), `room_types` 공개읽기(Task 1).
- Produces: `RegistrationPayload`에 `roomTypeId?: string` 추가; insert 시 head 행 `requested_room_type_id`로 저장. `RegistrationForm`이 `roomTypes` prop을 받아 선택 UI 노출.

- [ ] **Step 1: register 페이지에서 room_types 로드 → 폼에 전달**

`src/app/[locale]/register/page.tsx`를 아래로 교체:

```tsx
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { RegistrationForm } from "@/components/RegistrationForm";
import type { RoomType } from "@/lib/types";

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data: roomTypes } = await supabase
    .from("room_types")
    .select("*")
    .order("sort_order");

  const t = await getTranslations("Register");

  return (
    <div className="mx-auto max-w-2xl px-6 py-16 sm:px-8">
      <h1 className="font-display-ko text-3xl font-bold text-pine sm:text-4xl">
        {t("title")}
      </h1>
      <div className="mt-4 h-px w-14 bg-gold" />
      <p className="mt-4 text-sm leading-relaxed text-bark-soft">
        {t("subtitle")}
      </p>
      <div className="mt-8">
        <RegistrationForm roomTypes={(roomTypes as RoomType[] | null) ?? []} />
      </div>
    </div>
  );
}
```

(주의: 기존 파일은 `use client` 아닌 서버 컴포넌트였고 `useTranslations`+`use(params)`를 썼음 → `getTranslations`+`await params`로 변경. `import { use }`/`useTranslations` import 제거됨.)

- [ ] **Step 2: actions.ts — payload + insert에 roomTypeId 반영**

`RegistrationPayload` 타입에 필드 추가(`members: PersonInput[];` 다음 줄):

```ts
  roomTypeId?: string; // 가구 단위 선택 객실 타입(가구주 행에 저장). 빈값=미선택
```

`insertRegistration`의 head 행 생성부(`rowFor(payload.householder, { ... })`)에 `requested_room_type_id`를 추가한다. 현재:

```ts
  const rows = [
    rowFor(payload.householder, {
      id: headId,
      is_householder: true,
      email,
      householder_id: null,
    }),
```
를 아래로 교체:

```ts
  const roomTypeId = clean(payload.roomTypeId);
  const rows = [
    {
      ...rowFor(payload.householder, {
        id: headId,
        is_householder: true,
        email,
        householder_id: null,
      }),
      requested_room_type_id: roomTypeId,
    },
```
(가구원 `members.map` 행은 그대로 — `requested_room_type_id` 미포함 = null.)

- [ ] **Step 3: RegistrationForm — 선택 상태 + UI + payload**

import에 추가:
```tsx
import { RoomTypeSelect } from "./RoomTypeSelect";
import type { RoomType } from "@/lib/types";
```
컴포넌트 시그니처 변경:
```tsx
export function RegistrationForm({ roomTypes }: { roomTypes: RoomType[] }) {
```
상태 추가(다른 useState 근처):
```tsx
  const [roomTypeId, setRoomTypeId] = useState("");
```
`handleSubmit`의 payload에 필드 추가:
```tsx
    const payload: RegistrationPayload = {
      mode,
      email,
      householder,
      members: mode === "household" ? members : [],
      roomTypeId,
    };
```
라벨은 `Fee` 네임스페이스 키를 쓰므로 컴포넌트 상단 훅 목록에
`const tfee = useTranslations("Fee");`를 추가한다(기존 `const tf = useTranslations("Fields");` 근처).

UI: 2단계 폼의 "등록 방식 선택" `</fieldset>` **다음**에 아래 블록을 삽입(가구 단위 선택):
```tsx
      {/* 객실 타입 선택 (가구 단위, 선택 사항) */}
      <div>
        <label className={labelClass}>{tfee("roomType")}</label>
        <RoomTypeSelect
          roomTypes={roomTypes}
          value={roomTypeId}
          onChange={setRoomTypeId}
          className={inputClass}
        />
      </div>
```

- [ ] **Step 4: 타입체크 + 린트**

Run: `npx tsc --noEmit && npx eslint "src/app/[locale]/register/page.tsx" "src/app/[locale]/register/actions.ts" src/components/RegistrationForm.tsx`
Expected: 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/[locale]/register/page.tsx" "src/app/[locale]/register/actions.ts" src/components/RegistrationForm.tsx
git commit -m "feat(register): 등록 폼 객실 타입 선택(가구단위)"
```

---

### Task 6: 수정 화면 — 타입 선택 + 회비 카드 + PayPal(선택 기반)

**Files:**
- Modify: `src/app/[locale]/edit/actions.ts` (신규 액션 `updateMyRoomType`)
- Modify: `src/app/[locale]/edit/manage/page.tsx`
- Modify: `src/components/EditForm.tsx`
- Modify: `src/components/HouseholdFeeCard.tsx`

**Interfaces:**
- Consumes: `RoomTypeSelect`(Task 4), `my_household_fee` 신 반환(Task 1: total/type_selected/paid), `buildDonateUrl`(기배포), i18n `Fee`(Task 2).
- Produces:
  - `updateMyRoomType(roomTypeId: string | null): EditResult` — 본인 가구 head 행 `requested_room_type_id` 갱신(paid면 거부).
  - `HouseholdFeeCard` prop `unassignedCount:number` → `typeSelected:boolean` 교체.
  - manage 페이지: room_types 로드 + head 현재 선택값 + payUrl(선택 기반 total).

- [ ] **Step 1: `updateMyRoomType` 액션 추가** (`src/app/[locale]/edit/actions.ts` 맨 끝에 추가)

```ts
// 본인 가구의 객실 타입 선택(가구주 행에 저장). RLS가 본인 가구 행만 허용.
// paid=true면 납부액과 불일치 방지를 위해 거부.
export async function updateMyRoomType(
  roomTypeId: string | null,
): Promise<EditResult> {
  const supabase = await createClient();
  const { data: idData } = await supabase.rpc("my_attendee_ids");
  const myIds = (idData as string[] | null) ?? [];
  if (myIds.length === 0) return { ok: false, error: "updateError" };

  // 본인 가구의 가구주 행 찾기 (본인이 head이거나, 본인 id를 householder_id로 갖는 가구)
  const { data: headRows } = await supabase
    .from("attendees")
    .select("id, paid")
    .eq("is_householder", true)
    .or(`id.in.(${myIds.join(",")}),householder_id.in.(${myIds.join(",")})`);
  const head = (headRows as { id: string; paid: boolean }[] | null)?.[0];
  if (!head) return { ok: false, error: "updateError" };
  if (head.paid) return { ok: false, error: "updateError" };

  const { error } = await supabase
    .from("attendees")
    .update({ requested_room_type_id: roomTypeId })
    .eq("id", head.id);
  if (error) return { ok: false, error: "updateError" };
  return { ok: true };
}
```

- [ ] **Step 2: `HouseholdFeeCard` — unassignedCount → typeSelected**

`src/components/HouseholdFeeCard.tsx`에서 props와 미선택 안내 분기를 교체.
props 타입/구조분해의 `unassignedCount: number` → `typeSelected: boolean`로,
`{unassignedCount > 0 && (...) }` 블록을 아래로 교체:

```tsx
      {!typeSelected && (
        <p className="mt-3 text-xs text-ivory/60">{t("selectTypeNotice")}</p>
      )}
```
(파일 상단 구조분해와 타입 정의의 `unassignedCount` 2곳을 `typeSelected`로 바꾸고, 위 렌더 분기 교체. `payUrl`/`paid`/`total` 유지.)

- [ ] **Step 3: manage 페이지 — RPC 신필드 + room_types + 타입선택 + payUrl**

`src/app/[locale]/edit/manage/page.tsx`:
(a) `fee` 캐스팅 타입을 교체:
```tsx
  const fee = feeData as {
    total: number;
    type_selected: boolean;
    paid: boolean;
  } | null;
```
(b) room_types 로드 + head 현재 선택값. `const rows = ...` 근처에 추가:
```tsx
  const { data: roomTypesData } = await supabase
    .from("room_types")
    .select("*")
    .order("sort_order");
  const roomTypes = (roomTypesData as import("@/lib/types").RoomType[] | null) ?? [];
  const currentRoomTypeId = head?.requested_room_type_id ?? "";
```
(주의: `head`는 `rows.find((a) => a.is_householder)` — 이미 존재. `requested_room_type_id`는 `Attendee`에 없으므로 Task 7에서 타입에 추가한다. 이 태스크 범위에선 `(head as { requested_room_type_id?: string | null } | undefined)?.requested_room_type_id ?? ""`로 안전 접근.)
(c) payUrl 조건의 `fee.unassigned_count === 0` → `fee.type_selected`로 교체:
```tsx
  if (
    fee &&
    !fee.paid &&
    fee.total > 0 &&
    fee.type_selected &&
    paypalEmail &&
    head
  ) {
```
(d) `<HouseholdFeeCard .../>` 호출의 `unassignedCount={fee.unassigned_count}` → `typeSelected={fee.type_selected}`.
(e) `<EditForm initial={rows} />`에 props 추가:
```tsx
        <EditForm
          initial={rows}
          roomTypes={roomTypes}
          currentRoomTypeId={currentRoomTypeId}
          paid={!!fee?.paid}
        />
```

- [ ] **Step 4: EditForm — 가구 단위 타입 선택 섹션**

`src/components/EditForm.tsx`:
import 추가:
```tsx
import { RoomTypeSelect } from "./RoomTypeSelect";
import { updateMyAttendee, updateMyRoomType } from "@/app/[locale]/edit/actions";
import type { Attendee, RoomType } from "@/lib/types";
```
(기존 `import { updateMyAttendee } ...`·`import type { Attendee } ...` 줄 대체.)
시그니처 변경:
```tsx
export function EditForm({
  initial,
  roomTypes,
  currentRoomTypeId,
  paid,
}: {
  initial: Attendee[];
  roomTypes: RoomType[];
  currentRoomTypeId: string;
  paid: boolean;
}) {
```
훅 추가(상단): `const tfee = useTranslations("Fee");`
상태 추가:
```tsx
  const [roomTypeId, setRoomTypeId] = useState(currentRoomTypeId);
  const [rtSaved, setRtSaved] = useState(false);
  const [rtError, setRtError] = useState(false);
```
저장 핸들러 추가:
```tsx
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
```
UI: `rows.length === 0` early-return 아래, `return ( <div className="space-y-6">` 바로 다음(첫 섹션 앞)에 삽입:
```tsx
      <section className="rounded-2xl bg-white/70 p-5 ring-1 ring-line">
        <label className="block text-sm font-medium text-bark">
          {tfee("roomType")}
        </label>
        <RoomTypeSelect
          roomTypes={roomTypes}
          value={roomTypeId}
          onChange={saveRoomType}
          disabled={paid}
          className="mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm shadow-sm focus:border-moss focus:outline-none focus:ring-1 focus:ring-moss disabled:opacity-60"
        />
        {paid ? (
          <p className="mt-1 text-xs text-bark-soft">
            {tfee("roomTypeLockedNote")}
          </p>
        ) : rtSaved ? (
          <p className="mt-1 text-xs text-moss">{t("updateSuccess")}</p>
        ) : rtError ? (
          <p className="mt-1 text-xs text-rose-700">{t("updateError")}</p>
        ) : null}
      </section>
```

- [ ] **Step 5: 타입체크 + 린트**

Run: `npx tsc --noEmit && npx eslint "src/app/[locale]/edit/actions.ts" "src/app/[locale]/edit/manage/page.tsx" src/components/EditForm.tsx src/components/HouseholdFeeCard.tsx`
Expected: 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add "src/app/[locale]/edit/actions.ts" "src/app/[locale]/edit/manage/page.tsx" src/components/EditForm.tsx src/components/HouseholdFeeCard.tsx
git commit -m "feat(edit): 수정화면 객실 타입 선택 + 회비카드/PayPal 선택 기반"
```

---

### Task 7: 관리자 뷰 선택 기반 정합 + 타입 컬럼 + 관리자 편집

**Files:**
- Modify: `src/lib/types.ts` (`Attendee.requested_room_type_id`)
- Modify: `src/app/[locale]/admin/(protected)/attendees/page.tsx`
- Modify: `src/app/[locale]/admin/(protected)/page.tsx` (대시보드)
- Modify: `src/app/[locale]/admin/(protected)/assignments/page.tsx`
- Modify: `src/app/[locale]/admin/actions.ts` (`adminUpdateAttendee` 화이트리스트 + `AdminEditInput`)
- Modify: `src/components/AdminEditForm.tsx`

**Interfaces:**
- Consumes: `withHouseholdRoomType`(Task 3), 공용 쿼리 조각, `RoomTypeSelect`(Task 4).
- Produces: 관리자 회비 뷰가 선택 기준으로 일치. 관리자 편집 폼에서 head 타입 지정.

- [ ] **Step 1: `Attendee` 타입에 컬럼 추가**

`src/lib/types.ts`의 `Attendee` 인터페이스, `room_id: string | null;` 다음 줄에 추가:
```ts
  requested_room_type_id: string | null; // 성도 선택 객실 타입(가구주 행, 회비 소스)
```

- [ ] **Step 2: 관리자 attendees 페이지 — 쿼리 조각 + 전처리**

`src/app/[locale]/admin/(protected)/attendees/page.tsx`:
select를 공용 조각으로 교체:
```ts
    .select(
      "*, rooms(label, room_types(name, price_per_person)), requested_room_type:room_types!requested_room_type_id(name, price_per_person)",
    )
```
`const attendees = (data as AttendeeWithRoom[] | null) ?? [];` 를 아래로 교체(전처리):
```ts
  const raw = (data as AttendeeWithRoom[] | null) ?? [];
  const attendees = withHouseholdRoomType(raw);
```
import에 `withHouseholdRoomType` 추가:
```ts
import { groupHouseholds, withHouseholdRoomType, type AttendeeWithRoom } from "@/lib/fees";
```

- [ ] **Step 3: 대시보드 페이지 — 쿼리 조각**

`src/app/[locale]/admin/(protected)/page.tsx`의 attendees select를 공용 조각으로 교체:
```ts
      supabase
        .from("attendees")
        .select(
          "*, rooms(label, room_types(name, price_per_person)), requested_room_type:room_types!requested_room_type_id(name, price_per_person)",
        ),
```
(computeDashboard는 Task 3에서 내부적으로 withHouseholdRoomType 적용 → 페이지 변경은 select만.)

- [ ] **Step 4: 방배치 페이지 — 쿼리 조각 + 전처리**

`src/app/[locale]/admin/(protected)/assignments/page.tsx`의 attendees select를 공용 조각으로 교체하고, AssignmentBoard에 넘기기 전 전처리:
```ts
    supabase
      .from("attendees")
      .select(
        "*, rooms(label, room_types(name, price_per_person)), requested_room_type:room_types!requested_room_type_id(name, price_per_person)",
      )
      .order("is_householder", { ascending: false })
      .order("created_at"),
```
그리고 `attendees` prop 전달부를 교체:
```tsx
      <AssignmentBoard
        rooms={(rooms as (Room & { room_types: RoomType })[] | null) ?? []}
        attendees={withHouseholdRoomType(
          (attendees as AttendeeWithRoom[] | null) ?? [],
        )}
      />
```
import에 `withHouseholdRoomType` 추가(기존 `import type { AttendeeWithRoom } from "@/lib/fees";` → 값 import 병행):
```ts
import { withHouseholdRoomType, type AttendeeWithRoom } from "@/lib/fees";
```

- [ ] **Step 5: `adminUpdateAttendee` — requested_room_type_id 화이트리스트**

`src/app/[locale]/admin/actions.ts`:
`AdminEditInput` 타입에 필드 추가:
```ts
export type AdminEditInput = PersonInput & {
  email?: string;
  language: Language;
  retreat_group?: string;
  is_group_leader?: boolean;
  requested_room_type_id?: string | null;
};
```
`adminUpdateAttendee`의 `.update({...})`에 추가(마지막 필드 뒤):
```ts
      requested_room_type_id: clean(input.requested_room_type_id) ,
```

- [ ] **Step 6: `AdminEditForm` — 타입 선택 필드**

`src/components/AdminEditForm.tsx`:
import 추가:
```tsx
import { RoomTypeSelect } from "./RoomTypeSelect";
import { LANGUAGES, type Attendee, type RoomType } from "@/lib/types";
```
(기존 `import { LANGUAGES, type Attendee } ...` 대체.)
`toInput`에 필드 추가(반환 객체 끝):
```ts
    requested_room_type_id: a.requested_room_type_id ?? "",
```
시그니처에 `roomTypes` prop 추가:
```tsx
export function AdminEditForm({
  initial,
  heads,
  isAttendeeAdmin,
  currentEmail,
  roomTypes,
}: {
  initial: Attendee;
  heads: HeadOption[];
  isAttendeeAdmin: boolean;
  currentEmail: string | null;
  roomTypes: RoomType[];
}) {
```
훅 추가: `const tfee = useTranslations("Fee");`
adminFields fieldset 안(예: `colGroup` div 다음)에 추가:
```tsx
          <div>
            <label className={labelClass}>{tfee("roomType")}</label>
            <RoomTypeSelect
              roomTypes={roomTypes}
              value={(data.requested_room_type_id as string) ?? ""}
              onChange={(id) => patch({ requested_room_type_id: id })}
              className={inputClass}
            />
          </div>
```

- [ ] **Step 7: AdminEditForm 호출 페이지에 roomTypes 전달**

`AdminEditForm`을 렌더하는 편집 페이지(`src/app/[locale]/admin/(protected)/attendees/[id]/edit/page.tsx`)에서 room_types를 로드해 prop으로 전달.
- 해당 페이지의 supabase 조회부에 room_types 조회를 추가:
```ts
  const { data: roomTypesData } = await supabase
    .from("room_types")
    .select("*")
    .order("sort_order");
```
- `<AdminEditForm ... />` 호출에 `roomTypes={(roomTypesData as RoomType[] | null) ?? []}` 추가, 상단 import에 `RoomType` 포함.

> 정확한 파일/라인은 구현자가 해당 페이지를 열어 확인(패턴은 assignments 페이지와 동일: 서버 컴포넌트에서 createClient로 조회 후 prop 전달).

- [ ] **Step 8: 타입체크 + 린트 + 빌드**

Run:
```bash
npx tsc --noEmit && npx eslint src && npm run build
```
Expected: 에러 없음, 빌드 성공.

- [ ] **Step 9: 커밋**

```bash
git add src/lib/types.ts "src/app/[locale]/admin" src/components/AdminEditForm.tsx
git commit -m "feat(admin): 회비 뷰 선택 기반 정합 + 관리자 편집 객실 타입 지정"
```

---

## 최종 통합 검증 (컨트롤러/최종리뷰 단계)

- **로컬 브라우저 E2E**(dev 서버 + 로컬 Supabase, 매직링크 세션):
  1. 등록 폼에서 객실 타입 선택 → 저장 → 재확인.
  2. /edit/manage: 타입 선택 → 회비 카드 $X + "PayPal로 $X 납부하기" href 확인(`amount` = 단가×6세이상 수). 미선택 시 안내만. paid 시 잠금.
  3. 관리자 대시보드·참석자표 회비가 선택 기준으로 성도 카드와 일치.
- `npm run build` 통과.

## 배포 후 작업 (사용자)

- ⚠️ **프로덕션 `supabase db push`로 0018 적용**(코드 병합/배포보다 먼저).
- (PayPal env는 이미 설정됨 — 추가 없음.)
- 실사용: 관리자가 필요 시 방 배정(로지스틱스)은 별도로 계속.

## Self-Review (작성자 체크 결과)

- **Spec coverage**: 데이터모델=T1, room_types 공개읽기=T1, RPC 재작성=T1, 회비 계산 전환=T3, 등록 선택=T5, 수정 선택+카드+PayPal=T6, 관리자 회비 정합+편집=T7, i18n=T2, 공용 select=T4. 스펙 전 항목 커버.
- **Placeholder scan**: T7 Step7만 "구현자가 파일 확인" — 편집 페이지 정확 경로가 리포 상 존재(패턴 명시). 그 외 완전 코드. TBD 없음.
- **Type consistency**: `AttendeeWithRoom.requested_room_type`(T3) ↔ 쿼리 임베드 별칭 `requested_room_type`(T2/T7) 일치. `my_household_fee` 반환 `(total,type_selected,paid)`(T1) ↔ manage 소비(T6) 일치. `HouseholdFeeCard` `typeSelected` prop(T6) ↔ 카드 정의(T6) 일치. `withHouseholdRoomType`(T3) ↔ 소비(T3 dashboard·T7 pages) 일치. `RoomTypeSelect` props(T4) ↔ 소비(T5/T6/T7) 일치. `Attendee.requested_room_type_id`(T7) ↔ manage 안전접근(T6, T7 전 임시 캐스팅) 일치.
