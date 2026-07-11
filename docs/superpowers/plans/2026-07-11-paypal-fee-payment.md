# PayPal 회비 납부 링크 (Option A2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 성도가 `/edit/manage` 회비 카드에서 교회 PayPal로 가구 회비를 바로 낼 수 있는 인라인 결제 링크(금액 자동입력·대조 참조값 포함)를 제공한다.

**Architecture:** 백엔드/API/웹훅/DB 변경 없는 순수 link-out. 서버 컴포넌트(manage 페이지)가 인라인 PayPal donate URL을 조립해 회비 카드에 전달하고, 카드는 조건 충족 시 새 탭 링크 버튼을 렌더한다. 납부 확인은 기존 관리자 수동 `paid` 토글 유지.

**Tech Stack:** Next.js 16 App Router(서버 컴포넌트), next-intl v4, TypeScript. 결제는 PayPal 인라인 donate URL(`https://www.paypal.com/donate?business=…&amount=…&item_name=…&item_number=…`).

## Global Constraints

- Next 16 규칙 유지: 서버 액션/서버 컴포넌트 패턴, `useTranslations`는 컴포넌트 상단에서만 호출.
- i18n 3개 언어 동기화: `messages/{ko,en,es}.json` 세 파일 모두 같은 키 유지.
- DB enum/데이터는 번역하지 않음. 표시 문자열은 messages로 번역.
- 프로젝트에 자동화 테스트 프레임워크 없음 → 검증은 `npx tsc --noEmit` + `npm run lint` + 브라우저/`npx tsx` 어서션.
- 수취 이메일은 공개값이지만 코드 하드코딩 금지 → 환경변수 `NEXT_PUBLIC_PAYPAL_BUSINESS_EMAIL`. 값: `newyorkevergreen@gmail.com`.
- 금액은 인라인에서 고정 표시(성도 입력 없음). `amount`는 `toFixed(2)` 문자열.
- `item_number` = 가구주 이름 + 구역 (예: `김철수 (3)`). 데이터이므로 번역 안 함.
- 결제 버튼 표시 조건(전부 충족): `미납 && total>0 && unassigned_count===0 && 이메일설정됨 && 가구주존재`.

---

### Task 1: PayPal 인라인 donate URL 빌더

**Files:**
- Create: `src/lib/paypal.ts`
- Test(임시): `scratchpad/paypal-check.mts` (커밋 안 함, 검증용)

**Interfaces:**
- Consumes: 없음(순수 함수, 외부 의존 없음)
- Produces:
  - `export const PAYPAL_CURRENCY = "USD"`
  - `export function buildDonateUrl(params: { email: string; amount: number; itemName: string; itemNumber: string }): string`
    - 반환 예: `https://www.paypal.com/donate?business=…&no_recurring=1&item_name=…&item_number=…&amount=300.00&currency_code=USD`

- [ ] **Step 1: 실패하는 어서션 스크립트 작성**

`scratchpad/paypal-check.mts` 생성 (경로는 세션 scratchpad 하위여도 무방하나, repo 상대 import를 위해 repo 루트 기준 상대경로 사용):

```ts
import assert from "node:assert/strict";
import { buildDonateUrl, PAYPAL_CURRENCY } from "../src/lib/paypal.ts";

// 1) 기본 파라미터 구성
const url = buildDonateUrl({
  email: "newyorkevergreen@gmail.com",
  amount: 300,
  itemName: "Evergreen Retreat 2026 Fee",
  itemNumber: "김철수 (3)",
});
const u = new URL(url);
assert.equal(u.origin + u.pathname, "https://www.paypal.com/donate");
assert.equal(u.searchParams.get("business"), "newyorkevergreen@gmail.com");
assert.equal(u.searchParams.get("no_recurring"), "1");
assert.equal(u.searchParams.get("item_name"), "Evergreen Retreat 2026 Fee");
assert.equal(u.searchParams.get("item_number"), "김철수 (3)"); // 한글 라운드트립
assert.equal(u.searchParams.get("amount"), "300.00"); // 소수 2자리 고정
assert.equal(u.searchParams.get("currency_code"), "USD");
assert.equal(PAYPAL_CURRENCY, "USD");

// 2) 소수 금액도 2자리로
const url2 = buildDonateUrl({ email: "a@b.com", amount: 550.5, itemName: "x", itemNumber: "y" });
assert.equal(new URL(url2).searchParams.get("amount"), "550.50");

console.log("OK: all paypal buildDonateUrl assertions passed");
```

- [ ] **Step 2: 실패 확인**

Run: `npx tsx scratchpad/paypal-check.mts`
Expected: FAIL — `Cannot find module '../src/lib/paypal.ts'` (또는 export 없음 에러)

- [ ] **Step 3: 최소 구현 작성**

`src/lib/paypal.ts`:

```ts
// PayPal 인라인 donate 결제 링크 빌더 (순수 함수).
// 백엔드/API 없이 URL만 조립한다. amount는 인라인에서 고정 표시된다.
// item_number는 관리자 대조용 참조값(가구주 이름·구역).

export const PAYPAL_CURRENCY = "USD";

const PAYPAL_DONATE_BASE = "https://www.paypal.com/donate";

export function buildDonateUrl(params: {
  email: string; // business (교회 수취 이메일)
  amount: number; // 가구 회비 합계
  itemName: string; // payer에게 보이는 항목명 (i18n)
  itemNumber: string; // 대조용 참조값 (가구주 이름·구역)
}): string {
  const q = new URLSearchParams({
    business: params.email,
    no_recurring: "1",
    item_name: params.itemName,
    item_number: params.itemNumber,
    amount: params.amount.toFixed(2),
    currency_code: PAYPAL_CURRENCY,
  });
  return `${PAYPAL_DONATE_BASE}?${q.toString()}`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx tsx scratchpad/paypal-check.mts`
Expected: PASS — `OK: all paypal buildDonateUrl assertions passed`

- [ ] **Step 5: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 6: 커밋** (임시 검증 스크립트는 scratchpad라 repo 밖 → 스테이징 안 됨)

```bash
git add src/lib/paypal.ts
git commit -m "feat(paypal): 인라인 donate URL 빌더 추가"
```

---

### Task 2: 회비 i18n 메시지 추가 (ko/en/es)

**Files:**
- Modify: `messages/ko.json` (`Fee` 객체)
- Modify: `messages/en.json` (`Fee` 객체)
- Modify: `messages/es.json` (`Fee` 객체)

**Interfaces:**
- Produces: `Fee.payWithPaypal`({amount} 보간), `Fee.payNotice`, `Fee.payItemName` — Task 3(카드)·Task 4(페이지)가 소비.

- [ ] **Step 1: ko.json `Fee`에 3개 키 추가**

`messages/ko.json`의 `Fee` 객체에서 `"pending": "미산정"` 뒤에 콤마를 붙이고 아래 키 추가:

```json
    "pending": "미산정",
    "payWithPaypal": "PayPal로 {amount} 납부하기",
    "payNotice": "결제 후 반영에는 관리자 확인이 필요합니다.",
    "payItemName": "늘푸른교회 2026 수련회 회비"
```

- [ ] **Step 2: en.json `Fee`에 3개 키 추가**

```json
    "pending": "Pending",
    "payWithPaypal": "Pay {amount} with PayPal",
    "payNotice": "After payment, an admin will confirm it before it shows here.",
    "payItemName": "Evergreen Church 2026 Retreat Fee"
```

- [ ] **Step 3: es.json `Fee`에 3개 키 추가**

```json
    "pending": "Pendiente",
    "payWithPaypal": "Pagar {amount} con PayPal",
    "payNotice": "Tras el pago, un administrador lo confirmará antes de que aparezca aquí.",
    "payItemName": "Cuota del Retiro 2026 de la Iglesia Evergreen"
```

- [ ] **Step 4: JSON 유효성 확인**

Run: `for f in ko en es; do node -e "JSON.parse(require('fs').readFileSync('messages/$f.json','utf8'));console.log('$f OK')"; done`
Expected: `ko OK` / `en OK` / `es OK`

- [ ] **Step 5: 커밋**

```bash
git add messages/ko.json messages/en.json messages/es.json
git commit -m "feat(i18n): 회비 PayPal 납부 문구(ko/en/es) 추가"
```

---

### Task 3: HouseholdFeeCard 결제 버튼

**Files:**
- Modify: `src/components/HouseholdFeeCard.tsx`

**Interfaces:**
- Consumes: `Fee.payWithPaypal`, `Fee.payNotice` (Task 2), `formatUSD` (`@/lib/fees`).
- Produces: `HouseholdFeeCard` props에 `payUrl?: string | null` 추가. Task 4(페이지)가 이 prop을 채운다.
  - 버튼 렌더 조건은 페이지가 이미 판단해 넘김 → 카드는 `payUrl`이 truthy면 버튼·안내문을 렌더.

- [ ] **Step 1: props에 payUrl 추가 + 버튼/안내문 렌더**

`src/components/HouseholdFeeCard.tsx` 전체를 아래로 교체:

```tsx
import { useTranslations } from "next-intl";
import { formatUSD } from "@/lib/fees";

export function HouseholdFeeCard({
  total,
  unassignedCount,
  paid,
  payUrl = null,
}: {
  total: number;
  unassignedCount: number;
  paid: boolean;
  payUrl?: string | null;
}) {
  const t = useTranslations("Fee");

  return (
    <div className="mb-8 rounded-2xl bg-pine p-6 text-ivory ring-1 ring-pine-deep">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ivory/70">{t("title")}</p>
          <p className="font-display mt-1 text-3xl font-bold text-gold">
            {formatUSD(total)}
          </p>
        </div>
        <span
          className={
            paid
              ? "rounded-full bg-gold px-3 py-1 text-sm font-semibold text-pine-deep"
              : "rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-ivory ring-1 ring-ivory/30"
          }
        >
          {paid ? t("paid") : t("unpaid")}
        </span>
      </div>
      {unassignedCount > 0 && (
        <p className="mt-3 text-xs text-ivory/60">
          {t("unassignedNotice", { count: unassignedCount })}
        </p>
      )}
      {payUrl && (
        <div className="mt-5">
          <a
            href={payUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-full bg-gold px-5 py-3 text-center text-sm font-semibold text-pine-deep transition hover:brightness-105"
          >
            {t("payWithPaypal", { amount: formatUSD(total) })}
          </a>
          <p className="mt-2 text-center text-xs text-ivory/60">
            {t("payNotice")}
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 타입체크 + 린트**

Run: `npx tsc --noEmit && npx eslint src/components/HouseholdFeeCard.tsx`
Expected: 에러 없음(출력 없음)

- [ ] **Step 3: 커밋**

```bash
git add src/components/HouseholdFeeCard.tsx
git commit -m "feat(fee): 회비 카드에 PayPal 납부 버튼(payUrl) 추가"
```

---

### Task 4: manage 페이지 결선 + 환경변수

**Files:**
- Modify: `src/app/[locale]/edit/manage/page.tsx`
- Modify: `.env.local` (로컬 실행용)

**Interfaces:**
- Consumes: `buildDonateUrl` (Task 1), `HouseholdFeeCard`의 `payUrl` prop (Task 3), `Fee.payItemName` (Task 2), `my_household_fee` RPC(`total`/`unassigned_count`/`paid`), 스코프된 `attendees` 행(가구주 = `is_householder`).
- Produces: 조건 충족 시 `payUrl`을 조립해 `HouseholdFeeCard`에 전달.

- [ ] **Step 1: `.env.local`에 수취 이메일 추가**

`.env.local` 맨 아래에 추가:

```
# PayPal 회비 납부(인라인 donate 링크) — 교회 수취 이메일(공개값)
NEXT_PUBLIC_PAYPAL_BUSINESS_EMAIL=newyorkevergreen@gmail.com
```

- [ ] **Step 2: 페이지에 payUrl 계산 로직 추가**

`src/app/[locale]/edit/manage/page.tsx` 상단 import에 추가:

```tsx
import { buildDonateUrl } from "@/lib/paypal";
```

`const t = await getTranslations("Edit");` 줄 **앞**에 아래 블록 삽입:

```tsx
  // PayPal 결제 링크: 미납 + 금액확정(미배정 0) + 이메일설정 + 가구주존재일 때만.
  const rows = (attendees as Attendee[] | null) ?? [];
  const head = rows.find((a) => a.is_householder);
  const paypalEmail = process.env.NEXT_PUBLIC_PAYPAL_BUSINESS_EMAIL;
  const tFee = await getTranslations("Fee");

  let payUrl: string | null = null;
  if (
    fee &&
    !fee.paid &&
    fee.total > 0 &&
    fee.unassigned_count === 0 &&
    paypalEmail &&
    head
  ) {
    const name =
      head.korean_name?.trim() || head.english_name?.trim() || "";
    const ref = head.district ? `${name} (${head.district})` : name;
    payUrl = buildDonateUrl({
      email: paypalEmail,
      amount: fee.total,
      itemName: tFee("payItemName"),
      itemNumber: ref,
    });
  }
```

- [ ] **Step 3: HouseholdFeeCard 호출에 payUrl 전달 + EditForm은 rows 재사용**

`fee && (<HouseholdFeeCard .../>)` 블록의 카드 호출을 아래로 교체:

```tsx
      {fee && (
        <HouseholdFeeCard
          total={fee.total}
          unassignedCount={fee.unassigned_count}
          paid={fee.paid}
          payUrl={payUrl}
        />
      )}
```

그리고 `<EditForm initial={(attendees as Attendee[] | null) ?? []} />` 를 아래로 교체(중복 캐스팅 제거, Task Step 2에서 만든 `rows` 재사용):

```tsx
        <EditForm initial={rows} />
```

- [ ] **Step 4: 타입체크 + 린트**

Run: `npx tsc --noEmit && npx eslint "src/app/[locale]/edit/manage/page.tsx"`
Expected: 에러 없음

- [ ] **Step 5: 로컬 브라우저 검증 (실데이터 흐름)**

로컬 Supabase가 떠 있어야 함(`supabase start`). 다음으로 결제 버튼이 실제 렌더/링크되는지 확인한다.

1. 테스트 가구 시드 + 객실 배정(금액 확정, 미배정 0 만들기):

```bash
docker exec -i supabase_db_retreat2026 psql -U postgres -d postgres <<'SQL'
-- 객실 타입/호실 1개 확보(이미 있으면 무시)
insert into public.room_types (name, capacity, price_per_person, sort_order)
  values ('테스트2인실', 2, 300, 99) on conflict do nothing;
with rt as (select id from public.room_types where name='테스트2인실' limit 1)
insert into public.rooms (label, room_type_id)
  select 'T-101', rt.id from rt
  where not exists (select 1 from public.rooms where label='T-101');
-- 가구주(이메일 보유) + 객실 배정
with rm as (select id from public.rooms where label='T-101' limit 1)
insert into public.attendees (id, korean_name, district, is_householder, email, householder_id, room_id)
  select '55555555-5555-5555-5555-555555555555','테스트가구주','3', true,
         'paytest@example.com', null, rm.id from rm;
SQL
```

2. 개발 서버 실행: `npm run dev`
3. Mailpit(http://127.0.0.1:54324)로 매직링크 흐름 검증:
   - 브라우저에서 `http://localhost:3000/edit` → 이메일 `paytest@example.com` 입력 → 매직링크 요청
   - Mailpit에서 링크 열어 `/edit/manage` 진입
4. 확인:
   - 회비 카드에 **$300** + "PayPal로 $300 납부하기" 버튼 노출
   - 버튼 `href`가 `https://www.paypal.com/donate?...&amount=300.00&item_number=%ED%85%8C%EC%8A%A4%ED%8A%B8%EA%B0%80%EA%B5%AC%EC%A3%BC%20(3)&...` 형태(개발자도구 확인)
   - `target="_blank"` 로 새 탭
5. 정리(시드 삭제):

```bash
docker exec -i supabase_db_retreat2026 psql -U postgres -d postgres <<'SQL'
delete from public.attendees where id='55555555-5555-5555-5555-555555555555';
delete from public.rooms where label='T-101';
delete from public.room_types where name='테스트2인실';
SQL
```

Expected: 버튼 노출 + href 정확. (미납·미배정0·이메일설정 조건 하)

- [ ] **Step 6: 커밋**

```bash
git add "src/app/[locale]/edit/manage/page.tsx" .env.local
git commit -m "feat(fee): manage 페이지에서 PayPal 결제 링크 조립·전달 + env"
```

> ⚠️ `.env.local`이 `.gitignore`에 있으면 스테이징되지 않는다(정상). 그 경우 커밋은 페이지만 포함하고, 이메일 값은 배포 시 Vercel env로 별도 주입.

---

## 배포 후 작업 (사용자, 코드 아님)

- Vercel Production 환경변수 추가: `NEXT_PUBLIC_PAYPAL_BUSINESS_EMAIL=newyorkevergreen@gmail.com` → **추가 후 Redeploy** (안 하면 미반영).
- 실결제 1건 테스트: 교회 PayPal 거래내역에 `item_number`(가구주 이름·구역)가 실제로 남는지 최종 확인.

## Self-Review (작성자 체크 결과)

- **Spec coverage**: 설정값(env)=Task4, URL빌더=Task1, 회비카드 버튼/조건=Task3+4, 페이지 결선=Task4, i18n=Task2, 관리자측 변경없음=해당없음, 테스트(빌더 어서션+브라우저)=Task1/Task4. 모든 스펙 섹션 커버됨.
- **Placeholder scan**: TBD/TODO 없음. 모든 코드 스텝에 완전한 코드 포함.
- **Type consistency**: `buildDonateUrl({email,amount,itemName,itemNumber})` 시그니처가 Task1 정의와 Task4 호출에서 일치. `payUrl?: string|null` prop이 Task3 정의와 Task4 전달에서 일치. `fee.unassigned_count`/`fee.total`/`fee.paid`는 기존 페이지의 `feeData` 캐스팅 타입과 일치.
