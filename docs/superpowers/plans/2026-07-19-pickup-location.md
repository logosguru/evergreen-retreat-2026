# 차량(교회 밴) 픽업 신청 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 참석자 개인별 "차량(교회 밴) 픽업 장소"(Manhattan/Flushing/Long Island(교회), 선택사항)를 등록·수정 폼에서 받고 관리자 화면(테이블 열 + 대시보드 집계)에 노출한다.

**Architecture:** `attendees.pickup_location` nullable enum 컬럼 하나(NULL=차량 불필요). 4개 폼이 공유하는 `PersonFields`에 단일 select("필요 없음" 기본), 서버는 공유 `rowFor()`/`cleanPickup()`으로 매핑. 관리자 테이블 열 + 대시보드 장소별 집계 카드.

**Tech Stack:** Next.js 16 App Router, Supabase(Postgres/RLS), next-intl v4, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-07-19-pickup-location-design.md`

## Global Constraints

- DB enum은 영문 토큰(`manhattan`/`flushing`/`long_island`)만 저장 — 화면 라벨은 messages 번역. DB에 표시 문자열 저장 금지.
- i18n은 **ko/en/es 3개 파일 모두** 같은 키로 추가 (es 누락 시 스페인어 화면 깨짐).
- `useTranslations`는 컴포넌트 상단에서만 호출 (콜백 안 금지).
- 이 프로젝트는 테스트 러너가 없음 — 각 태스크의 검증은 `npx tsc --noEmit` + 마지막 태스크의 lint/build/로컬 실동작 확인.
- 커밋 메시지 말미: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: DB 마이그레이션 + 타입 상수

**Files:**
- Create: `supabase/migrations/0020_pickup_location.sql`
- Modify: `src/lib/types.ts` (LANGUAGES 상수 아래, Attendee 인터페이스)

**Interfaces:**
- Produces: `PICKUP_LOCATIONS: readonly ["manhattan","flushing","long_island"]`, `type PickupLocation`, `Attendee.pickup_location: PickupLocation | null` — 이후 모든 태스크가 사용.

- [ ] **Step 1: 마이그레이션 작성**

`supabase/migrations/0020_pickup_location.sql` 생성 (0007의 enum 패턴을 따름 — 타입명 `_t` 접미사):

```sql
-- =====================================================================
-- 차량(교회 밴) 픽업 장소. NULL = 차량 불필요.
-- 성도 본인이 수정 가능한 일반 컬럼 — guard_privileged_cols 대상 아님.
-- =====================================================================
create type public.pickup_location_t as enum ('manhattan', 'flushing', 'long_island');

alter table public.attendees
  add column pickup_location public.pickup_location_t null;
```

- [ ] **Step 2: 로컬 Supabase에 적용 확인**

Run: `supabase migration up` (로컬 스택이 안 떠 있으면 먼저 `supabase start`)
Expected: `Applying migration 0020_pickup_location.sql...` 후 오류 없음.
확인: `psql "$(supabase status -o json 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin)["DB_URL"])' 2>/dev/null || echo postgresql://postgres:postgres@127.0.0.1:54322/postgres)" -c "\d public.attendees" | grep pickup`
Expected: `pickup_location | pickup_location_t` 행 출력.

- [ ] **Step 3: types.ts에 상수·타입 추가**

`src/lib/types.ts`의 `LANGUAGES` 블록(43행 부근) 아래에 추가:

```ts
// 차량(교회 밴) 픽업 장소 토큰. 라벨은 i18n "Pickup" 네임스페이스에서 번역.
export const PICKUP_LOCATIONS = ["manhattan", "flushing", "long_island"] as const;
export type PickupLocation = (typeof PICKUP_LOCATIONS)[number];
```

`Attendee` 인터페이스의 `attendance: Attendance;` 다음 줄에 추가:

```ts
  pickup_location: PickupLocation | null; // 차량(교회 밴) 픽업 장소. null=불필요
```

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 오류 0건.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0020_pickup_location.sql src/lib/types.ts
git commit -m "feat(db): attendees.pickup_location enum 컬럼(차량 픽업 장소) + 타입 상수

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 서버 매핑·화이트리스트 (공유 rowFor + 수정 액션 2곳)

**Files:**
- Modify: `src/lib/attendee-rows.ts`
- Modify: `src/app/[locale]/edit/actions.ts:59-72` (`updateMyAttendee`의 update 객체)
- Modify: `src/app/[locale]/admin/actions.ts:260-279` (`adminUpdateAttendee`의 update 객체)

**Interfaces:**
- Consumes: Task 1의 `PICKUP_LOCATIONS`, `PickupLocation`.
- Produces: `PersonInput.pickup_location?: PickupLocation | ""`, `cleanPickup(v?: string | null): PickupLocation | null` — Task 3의 폼이 `PersonInput.pickup_location`을 사용.
- 참고: 신규 등록 경로(`insertRegistration`, `addMyMember`, `adminInsertAttendee`)는 전부 `rowFor()`를 쓰므로 이 태스크로 자동 반영. **UPDATE 경로 2곳만** 화이트리스트에 명시적 추가 필요.

- [ ] **Step 1: attendee-rows.ts 수정**

import 교체(1행):

```ts
import {
  PICKUP_LOCATIONS,
  type Attendance,
  type Gender,
  type PickupLocation,
  type Role,
} from "@/lib/types";
```

`PersonInput`의 `departure_at` 필드 다음에 추가:

```ts
  pickup_location?: PickupLocation | ""; // 차량 픽업 장소. ""/미지정 = 불필요
```

`toTimestamp` 함수 아래에 추가:

```ts
// 클라이언트 값 불신: 3개 토큰 외(빈값 포함)는 null(차량 불필요)로 정규화.
// 위조 요청만 해당 — 정상 UI(select)에선 발생 불가. DB enum이 최종 방어선.
export function cleanPickup(v?: string | null): PickupLocation | null {
  return PICKUP_LOCATIONS.includes(v as PickupLocation)
    ? (v as PickupLocation)
    : null;
}
```

`rowFor()` 반환 객체의 `note: clean(p.note),` 앞에 추가:

```ts
    pickup_location: cleanPickup(p.pickup_location),
```

- [ ] **Step 2: updateMyAttendee 화이트리스트 추가**

`src/app/[locale]/edit/actions.ts` — import에 `cleanPickup` 추가:

```ts
import { clean, cleanPickup, rowFor, validatePerson } from "@/lib/attendee-rows";
```

`updateMyAttendee`의 `.update({...})` 객체에서 `note: clean(input.note),` 앞에 추가:

```ts
      pickup_location: cleanPickup(input.pickup_location),
```

- [ ] **Step 3: adminUpdateAttendee 화이트리스트 추가**

`src/app/[locale]/admin/actions.ts` — 기존 `@/lib/attendee-rows` import 블록에 `cleanPickup` 추가. `adminUpdateAttendee`의 `.update({...})` 객체에서 `note: clean(input.note),` 앞에 추가:

```ts
      pickup_location: cleanPickup(input.pickup_location),
```

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 오류 0건.

- [ ] **Step 5: Commit**

```bash
git add src/lib/attendee-rows.ts "src/app/[locale]/edit/actions.ts" "src/app/[locale]/admin/actions.ts"
git commit -m "feat(server): pickup_location 매핑(rowFor)·정규화(cleanPickup) + 수정 액션 화이트리스트

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 폼 UI (PersonFields 단일 select) + 초기값 매핑 + i18n

**Files:**
- Modify: `src/components/PersonFields.tsx` (select 추가, `emptyPerson`)
- Modify: `src/components/EditForm.tsx:18-32` (`toPersonInput`)
- Modify: `src/components/AdminEditForm.tsx:24-43` (`toInput`)
- Modify: `messages/ko.json`, `messages/en.json`, `messages/es.json`

**Interfaces:**
- Consumes: Task 1 `PICKUP_LOCATIONS`, Task 2 `PersonInput.pickup_location`.
- Produces: i18n 네임스페이스 `Pickup`(`manhattan`/`flushing`/`long_island`) — Task 4·5의 관리자 화면도 같은 네임스페이스로 라벨 번역.
- 4개 폼(RegistrationForm/EditForm/AdminNewAttendeeForm/AdminEditForm) 모두 `PersonFields`를 렌더하므로 UI는 이 한 곳으로 전파. RegistrationForm/AdminNewAttendeeForm은 수정 불필요.

- [ ] **Step 1: messages 3개 파일에 키 추가**

`messages/ko.json` — `Fields` 객체 끝(`notePlaceholder` 뒤)에 추가:

```json
"pickup": "차량 픽업 (교회 밴)",
"pickupNone": "필요 없음",
"pickupHint": "차량이 필요한 분을 위해 교회 밴 운행을 계획하고 있습니다. 픽업이 필요하면 장소를 선택해 주세요."
```

`messages/ko.json` — 최상위에 `Pickup` 네임스페이스 추가(`Language` 네임스페이스 옆):

```json
"Pickup": {
  "manhattan": "Manhattan",
  "flushing": "Flushing",
  "long_island": "Long Island (교회)"
}
```

`messages/en.json` — `Fields`에:

```json
"pickup": "Ride pickup (church van)",
"pickupNone": "Not needed",
"pickupHint": "We are planning to run a church van for those who need a ride. If you need pickup, choose a location."
```

`messages/en.json` — 최상위 `Pickup`:

```json
"Pickup": {
  "manhattan": "Manhattan",
  "flushing": "Flushing",
  "long_island": "Long Island (Church)"
}
```

`messages/es.json` — `Fields`에:

```json
"pickup": "Transporte (van de la iglesia)",
"pickupNone": "No lo necesito",
"pickupHint": "Estamos planeando operar una van de la iglesia para quienes necesiten transporte. Si necesita que lo recojan, elija un lugar."
```

`messages/es.json` — 최상위 `Pickup`:

```json
"Pickup": {
  "manhattan": "Manhattan",
  "flushing": "Flushing",
  "long_island": "Long Island (Iglesia)"
}
```

- [ ] **Step 2: PersonFields에 select 추가**

`src/components/PersonFields.tsx` — import에 `PICKUP_LOCATIONS` 추가:

```ts
import {
  DISTRICTS,
  GENDERS,
  PICKUP_LOCATIONS,
  ROLES,
  RETREAT_START,
  RETREAT_END,
  type Attendance,
} from "@/lib/types";
```

컴포넌트 상단 훅 목록(`const ta = useTranslations("Attendance");` 다음)에 추가:

```ts
  const tp = useTranslations("Pickup");
```

부분참석 날짜 블록(`{value.attendance === "partial" && (...)}` 닫힌 뒤)과 `note` textarea 블록 사이에 추가:

```tsx
      <div className="sm:col-span-2">
        <label className={labelClass}>{t("pickup")}</label>
        <select
          value={value.pickup_location ?? ""}
          onChange={(e) =>
            onChange({
              pickup_location: e.target.value as PersonInput["pickup_location"],
            })
          }
          className={inputClass}
        >
          <option value="">{t("pickupNone")}</option>
          {PICKUP_LOCATIONS.map((p) => (
            <option key={p} value={p}>
              {tp(p)}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-bark-soft">{t("pickupHint")}</p>
      </div>
```

파일 하단 `emptyPerson()`의 `note: "",` 앞에 추가:

```ts
  pickup_location: "",
```

- [ ] **Step 3: 기존 값 → 폼 초기값 매핑 2곳**

`src/components/EditForm.tsx` `toPersonInput()`의 `note: a.note ?? "",` 앞에 추가:

```ts
    pickup_location: a.pickup_location ?? "",
```

`src/components/AdminEditForm.tsx` `toInput()`의 `note: a.note ?? "",` 앞에 동일하게 추가:

```ts
    pickup_location: a.pickup_location ?? "",
```

- [ ] **Step 4: 타입체크 + 폼 실동작 확인**

Run: `npx tsc --noEmit`
Expected: 오류 0건.

Run: `npm run dev` 후 http://localhost:3000/register (2단계 이메일 확인 통과 후 폼)
Expected: "차량 픽업 (교회 밴)" select가 요청사항 위에 표시, 기본값 "필요 없음", 옵션 3개(Manhattan/Flushing/Long Island (교회)). /en/register에서 영어 라벨 확인.

등록 1건 제출(장소 선택) 후 DB 확인:
`psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select korean_name, pickup_location from attendees order by created_at desc limit 3"`
Expected: 선택한 토큰(예: `manhattan`) 저장. 미선택 등록은 `NULL`.

- [ ] **Step 5: Commit**

```bash
git add src/components/PersonFields.tsx src/components/EditForm.tsx src/components/AdminEditForm.tsx messages/ko.json messages/en.json messages/es.json
git commit -m "feat(register): 차량 픽업 장소 select(교회 밴, 선택사항) — 등록·수정·관리자 폼 공통

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 관리자 참석자 테이블 "차량" 열

**Files:**
- Modify: `src/components/AdminAttendeeTable.tsx`
- Modify: `messages/ko.json`, `messages/en.json`, `messages/es.json` (`Admin.colPickup`)

**Interfaces:**
- Consumes: Task 1 `Attendee.pickup_location`, Task 3 `Pickup` 네임스페이스.
- 주의: 두 보기(가구별/리스트)가 `personCells()`를 공유 — 셀 1개 추가 시 **가구별 보기 헤더의 `colSpan={7}`을 8로** 반드시 변경.

- [ ] **Step 1: colPickup 메시지 추가**

`Admin` 네임스페이스의 `colRoom` 옆에, 3개 파일 각각:
- `messages/ko.json`: `"colPickup": "차량",`
- `messages/en.json`: `"colPickup": "Ride",`
- `messages/es.json`: `"colPickup": "Transporte",`

- [ ] **Step 2: 테이블 열 추가**

`src/components/AdminAttendeeTable.tsx` — 컴포넌트 상단 훅 목록(`const tl = useTranslations("Language");` 다음)에 추가:

```ts
  const tp = useTranslations("Pickup");
```

`personCells()`의 방(room) `<td>`(`{a.rooms?.label ?? trm("unassigned")}`) 다음, 언어 select `<td>` 앞에 추가:

```tsx
        <td className="px-3 py-2 text-slate-600">
          {a.pickup_location ? tp(a.pickup_location) : "—"}
        </td>
```

가구별 보기 `<thead>`: `{t("colRoom")}` th 다음에 추가 + 가구 헤더 행 `colSpan={7}` → `colSpan={8}`:

```tsx
                <th className="px-3 py-2 text-left font-medium">{t("colPickup")}</th>
```

리스트 보기 `<thead>`: room `SortTh` 다음, language `SortTh` 앞에 추가(정렬 미지원 일반 th):

```tsx
              <th className="px-3 py-2 text-left font-medium">
                {t("colPickup")}
              </th>
```

- [ ] **Step 3: 타입체크 + 화면 확인**

Run: `npx tsc --noEmit` → 오류 0건.
http://localhost:3000/admin/attendees (관리자 로그인) — 가구별/리스트 보기 모두에서 "차량" 열이 방·언어 사이에 표시되고, 가구 헤더 행이 전체 폭(8열)인지, Task 3에서 등록한 행에 장소 라벨이 보이는지 확인.

- [ ] **Step 4: Commit**

```bash
git add src/components/AdminAttendeeTable.tsx messages/ko.json messages/en.json messages/es.json
git commit -m "feat(admin): 참석자 테이블 차량 픽업 열(가구별·리스트 보기)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 대시보드 픽업 집계 카드

**Files:**
- Modify: `src/lib/dashboard.ts`
- Modify: `src/components/AdminDashboard.tsx`
- Modify: `messages/ko.json`, `messages/en.json`, `messages/es.json` (`Admin.dashPickup*`)

**Interfaces:**
- Consumes: Task 1 `PICKUP_LOCATIONS`, `Pickup` 네임스페이스.
- Produces: `DashboardStats.pickup: CountItem[]`(PICKUP_LOCATIONS 순, count 0 포함), `DashboardStats.pickupTotal: number`.

- [ ] **Step 1: computeDashboard 집계 추가**

`src/lib/dashboard.ts` — 파일 상단에 import 추가:

```ts
import { PICKUP_LOCATIONS } from "./types";
```

`DashboardStats` 인터페이스의 `byRole: CountItem[];` 다음에 추가:

```ts
  pickup: CountItem[]; // 장소별 픽업 필요 인원 (PICKUP_LOCATIONS 순, 0 포함)
  pickupTotal: number;
```

`computeDashboard()` 반환 객체의 `byRole: tally((a) => a.role),` 다음에 추가:

```ts
    pickup: PICKUP_LOCATIONS.map((key) => ({
      key,
      count: attendees.filter((a) => a.pickup_location === key).length,
    })),
    pickupTotal: attendees.filter((a) => a.pickup_location != null).length,
```

- [ ] **Step 2: 대시보드 메시지 추가**

`Admin` 네임스페이스(`dashByRole` 옆)에, 3개 파일 각각:
- ko: `"dashPickup": "차량 픽업", "dashPickupTotal": "픽업 필요 인원"`
- en: `"dashPickup": "Van pickup", "dashPickupTotal": "need a ride"`
- es: `"dashPickup": "Transporte en van", "dashPickupTotal": "necesitan transporte"`

- [ ] **Step 3: AdminDashboard 카드 추가**

`src/components/AdminDashboard.tsx` — `TONES`에 violet 톤 추가(`amber` 다음):

```ts
  violet: {
    card: "bg-violet-50 ring-violet-100",
    eyebrow: "text-violet-700",
    hero: "text-violet-800",
    bar: "bg-violet-500",
    track: "bg-violet-100",
  },
```

컴포넌트 상단 훅 목록(`const tr = useTranslations("Role");` 다음)에 추가:

```ts
  const tp = useTranslations("Pickup");
```

상단 카드 그리드(`grid grid-cols-1 gap-4 sm:grid-cols-2`) 안, 회비 카드(`<Card tone="amber" ...>`) 닫힌 뒤에 추가:

```tsx
        {/* 차량 픽업 (교회 밴) — 장소별 필요 인원 */}
        <Card tone="violet" title={t("dashPickup")}>
          <div className="flex items-baseline gap-2">
            <p className="text-4xl font-bold text-violet-800">
              {stats.pickupTotal}
            </p>
            <p className="text-sm text-violet-700">{t("dashPickupTotal")}</p>
          </div>
          <ul className="mt-3 space-y-2">
            {stats.pickup.map((p) => (
              <li key={p.key}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-violet-900">{tp(p.key)}</span>
                  <span className="font-semibold text-violet-800">
                    {p.count}
                  </span>
                </div>
                <div className="mt-1">
                  <Bar
                    value={p.count}
                    total={Math.max(1, stats.pickupTotal)}
                    tone="violet"
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
```

- [ ] **Step 4: 타입체크 + 화면 확인**

Run: `npx tsc --noEmit` → 오류 0건.
http://localhost:3000/admin — 보라색 "차량 픽업" 카드에 합계·장소별 인원(0 포함 3줄)이 표시되는지, Task 3 등록 건이 집계에 반영됐는지 확인.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard.ts src/components/AdminDashboard.tsx messages/ko.json messages/en.json messages/es.json
git commit -m "feat(admin): 대시보드 차량 픽업 집계 카드(장소별 인원)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 전체 검증 (빌드 + 로컬 e2e)

**Files:** 없음 (검증만; 발견된 문제는 해당 파일 수정 후 재검증)

- [ ] **Step 1: 정적 검증 일괄 실행**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 3개 모두 오류 0건. (build는 로컬 `.env.local` 기준 — Supabase 로컬 스택 실행 상태에서)

- [ ] **Step 2: 로컬 e2e — 성도 흐름**

`supabase start` + `npm run dev` 상태에서:
1. `/register` 개인 등록: 픽업 "Manhattan" 선택 → 제출 → DB에 `manhattan` 확인
2. `/register` 가구 등록(2인): 가구주 "필요 없음", 가족 "Flushing" → DB에 `NULL`/`flushing` 확인
3. `/edit` 매직링크(Mailpit http://127.0.0.1:54324) → `/edit/manage`에서 1의 값이 select에 "Manhattan"으로 로드 → "필요 없음"으로 변경·저장 → DB `NULL` 확인

- [ ] **Step 3: 로컬 e2e — 관리자 흐름**

1. `/admin/attendees`: 2의 가족 행 "차량" 열에 "Flushing", 가구주 행 "—" (두 보기 모두)
2. `/admin/attendees/[id]/edit`: 가족 행 열어 픽업 "Long Island (교회)"로 변경·저장 → 테이블 반영 확인
3. `/admin/attendees/new`: 신규 1건 픽업 지정 입력 → 저장 확인
4. `/admin` 대시보드: 픽업 카드 합계·장소별 수치가 위 데이터와 일치

- [ ] **Step 4: 검증 결과 기록**

실패 항목이 있으면 superpowers:systematic-debugging으로 원인 수정 후 이 태스크 재실행. 전부 통과 시 완료 보고.
