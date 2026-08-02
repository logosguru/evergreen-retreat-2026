# 호텔 제출용 예상 방 갯수 섹션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 대시보드(`/admin`)에 호텔에 전달할 예상 예약 방 갯수를 타입별 내역과 함께 보여주는 섹션을 추가한다.

**Architecture:** 순수 함수 `estimateHotelRooms()`가 가구별로 방 수를 계산한다(가족은 전용방, 1~2인 동일성별 소가구는 합방 풀). 서버 컴포넌트가 미선택 가정 2/3/4인실 **3가지 시나리오를 미리 계산**해 클라이언트 컴포넌트에 넘기고, 클라이언트는 토글로 보여줄 시나리오만 고른다. DB 스키마 변경·마이그레이션 없음.

**Tech Stack:** Next.js 16.2.9 App Router, TypeScript, Tailwind v4, next-intl v4, `node --test` (Node 26 네이티브 타입 스트리핑, 의존성 추가 없음)

## Global Constraints

- **마이그레이션 금지** — 이 기능은 읽기 전용 집계다. `supabase/migrations/` 를 건드리지 않는다.
- **6세 미만(`is_under_6`)은 방 정원 수식에 절대 넣지 않는다.** 별도 카운트로만 노출.
- **확정 그룹과 가정 그룹은 서로 합방하지 않는다.** capacity·성별이 같아도 별도 방.
- **DB에 표시 문자열 저장 금지.** 화면 라벨은 `messages/{ko,en,es}.json` 에서만. 방 타입 라벨은 DB의 `room_types.name`(한글 문자열) 대신 **capacity로부터 i18n 생성**한다.
- `useTranslations` 는 컴포넌트 최상단에서 호출 — 콜백/조건문 안에서 호출 금지.
- 각주는 **값이 0이면 렌더하지 않는다** (노이즈 방지).
- 검증 명령: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
- 커밋 메시지는 한국어 + `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` 로 끝낸다.

## File Structure

| 파일 | 책임 |
|---|---|
| `tsconfig.json` (수정) | `allowImportingTsExtensions: true` — 테스트가 `./x.ts` 확장자 import를 쓰므로 필요 |
| `package.json` (수정) | `test` 스크립트 추가 |
| `src/lib/fees.ts` (수정) | `RoomTypeLite` 에 `capacity: number` 추가 |
| `src/lib/hotel-estimate.ts` (신규) | 추정 로직 전부. 순수 함수, DB·React 의존 없음 |
| `src/lib/hotel-estimate.test.ts` (신규) | 위 로직의 단위 테스트 (이 저장소 첫 JS 테스트) |
| `messages/{ko,en,es}.json` (수정) | `HotelEstimate` 네임스페이스 |
| `src/components/HotelEstimate.tsx` (신규) | 표 + 가정 토글. 클라이언트 컴포넌트 (state만, 서버 액션 없음) |
| `src/app/[locale]/admin/(protected)/page.tsx` (수정) | embed에 `capacity` 추가, 3 시나리오 계산, 섹션 렌더 |

### 스펙에서 벗어난 결정 1건 (의도적 개선)

스펙은 클라이언트 컴포넌트가 `attendees` 전체를 props로 받아 브라우저에서 재계산하는 구조였다.
**변경:** 서버가 capacity 2/3/4 세 시나리오를 미리 계산해 `HotelEstimate[]` 만 넘긴다.
**이유:** 전체 참석자 행에는 이메일·전화·비고(PII)가 들어 있다. 관리자 전용 페이지라 유출은 아니지만
HTML 페이로드에 PII를 실어 보낼 이유가 없고, 3개 요약 객체가 수백 행보다 훨씬 작다.
동작·표시 결과는 동일하다.

---

### Task 1: 테스트 인프라 + `RoomTypeLite.capacity`

`estimateHotelRooms` 가 가구주 선택 타입의 **정원**을 알아야 하는데 현재 `RoomTypeLite` 는
`name`/`price_per_person` 만 갖고 있다. 그리고 이 저장소엔 JS 테스트 러너가 아예 없다.
두 배관을 먼저 깔고, 테스트가 실제로 돌아가는 것까지 확인한다.

**Files:**
- Modify: `tsconfig.json` (compilerOptions에 1줄)
- Modify: `package.json` (scripts에 1줄)
- Modify: `src/lib/fees.ts:5` (`RoomTypeLite`)
- Test: `src/lib/hotel-estimate.test.ts` (신규, 이 태스크에선 배관 확인용 1개만)

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `RoomTypeLite = { name: string; price_per_person: number; capacity: number }`
  - `npm test` → `node --test "src/**/*.test.ts"`

- [ ] **Step 1: `tsconfig.json` 에 `allowImportingTsExtensions` 추가**

`"moduleResolution": "bundler",` 바로 다음 줄에 삽입:

```json
    "allowImportingTsExtensions": true,
```

이게 없으면 테스트의 `from "./fees.ts"` 가 `tsc --noEmit` 에서
`error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.` 로 깨진다.
`noEmit: true` 가 이미 설정돼 있어 이 옵션 사용 조건은 충족된다.
(Node ESM은 확장자 없는 상대 경로를 해석하지 못하므로 `.ts` 를 빼는 방향은 불가.)

- [ ] **Step 2: `package.json` 에 test 스크립트 추가**

`"lint": "eslint"` 다음 줄에:

```json
    "test": "node --test \"src/**/*.test.ts\""
```

글롭은 **따옴표로 감싼다** — zsh가 아니라 Node가 해석해야 한다.

- [ ] **Step 3: `RoomTypeLite` 에 `capacity` 추가**

`src/lib/fees.ts` 에서:

```ts
export type RoomTypeLite = { name: string; price_per_person: number };
```

를 다음으로 바꾼다:

```ts
export type RoomTypeLite = {
  name: string;
  price_per_person: number;
  capacity: number;
};
```

`personFee()` 는 `price_per_person` 만 읽으므로 로직 영향 없음.

- [ ] **Step 4: 배관 확인용 실패 테스트 작성**

`src/lib/hotel-estimate.test.ts` 생성:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateHotelRooms } from "./hotel-estimate.ts";

test("빈 명단이면 방 0개", () => {
  const est = estimateHotelRooms([], 4);
  assert.equal(est.totalRooms, 0);
  assert.equal(est.assumed, null);
  assert.deepEqual(est.decided, []);
});
```

- [ ] **Step 5: 테스트가 실패하는 것 확인**

Run: `npm test`
Expected: FAIL — `Cannot find module .../hotel-estimate.ts` (파일이 아직 없음)

- [ ] **Step 6: 통과할 최소 구현**

`src/lib/hotel-estimate.ts` 생성:

```ts
import type { AttendeeWithRoom } from "./fees.ts";

// 호텔 예약 협상용 방 갯수 추정. 실제 물리적 배정은 /admin/assignments 담당.
export type AssumedCapacity = 2 | 3 | 4;
export const ASSUMED_CAPACITIES: readonly AssumedCapacity[] = [2, 3, 4];

export interface EstimateBucket {
  capacity: number;
  households: number;
  people: number; // 정원 집계 인원 (6세 미만 제외)
  familyRooms: number; // 가구 전용방
  sharedRooms: number; // 성별 합방
  rooms: number; // familyRooms + sharedRooms
}

export interface HotelEstimate {
  decided: EstimateBucket[]; // 타입 선택 완료, capacity 오름차순
  assumed: EstimateBucket | null; // 미선택 가구 (없으면 null)
  totalRooms: number;
  totalPeople: number;
  under6: number;
  partialCount: number;
  unknownGenderHouseholds: number;
  zeroOccupancyHouseholds: number;
  unlinkedAttendees: number;
  assumedCapacity: AssumedCapacity;
}

export function estimateHotelRooms(
  attendees: AttendeeWithRoom[],
  assumedCapacity: AssumedCapacity,
): HotelEstimate {
  return {
    decided: [],
    assumed: null,
    totalRooms: 0,
    totalPeople: 0,
    under6: 0,
    partialCount: 0,
    unknownGenderHouseholds: 0,
    zeroOccupancyHouseholds: 0,
    unlinkedAttendees: 0,
    assumedCapacity,
  };
}
```

`attendees` 가 아직 안 쓰여서 lint가 unused를 잡을 수 있다 — 그럴 경우 이 태스크에선
`void attendees;` 한 줄을 함수 첫 줄에 두고, Task 3에서 실제로 사용하며 지운다.

- [ ] **Step 7: 테스트·타입체크·린트 통과 확인**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: 테스트 1 pass, tsc 출력 없음, lint 통과

- [ ] **Step 8: 커밋**

```bash
git add tsconfig.json package.json src/lib/fees.ts src/lib/hotel-estimate.ts src/lib/hotel-estimate.test.ts
git commit -m "$(cat <<'EOF'
chore: node --test 테스트 인프라 + RoomTypeLite.capacity

Node 26 네이티브 타입 스트리핑으로 의존성 없이 단위 테스트.
호텔 방 갯수 추정이 선택 타입의 정원을 필요로 함.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 가구 헬퍼 — `householdOccupants()` / `soleGender()`

방 수 계산의 두 판단 기준을 먼저 독립 함수로 분리해 테스트한다.
(1) 누가 정원에 집계되는가, (2) 이 가구를 성별 합방 풀에 넣어도 되는가.

**Files:**
- Modify: `src/lib/hotel-estimate.ts`
- Test: `src/lib/hotel-estimate.test.ts`

**Interfaces:**
- Consumes: `AttendeeWithRoom` (`src/lib/fees.ts`), `Household` (`src/lib/fees.ts`)
- Produces:
  - `householdOccupants(h: Household): AttendeeWithRoom[]`
  - `soleGender(occupants: AttendeeWithRoom[]): Gender | null`
  - `makeAttendee(over: Partial<AttendeeWithRoom>): AttendeeWithRoom` (테스트 파일 내부 헬퍼)

- [ ] **Step 1: 테스트 픽스처 헬퍼 + 실패 테스트 작성**

`src/lib/hotel-estimate.test.ts` 의 import 블록을 아래로 교체하고 테스트를 **추가**한다
(Task 1의 "빈 명단" 테스트는 그대로 남긴다):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estimateHotelRooms,
  householdOccupants,
  soleGender,
} from "./hotel-estimate.ts";
import { groupHouseholds, type AttendeeWithRoom } from "./fees.ts";

let seq = 0;

// Attendee 필수 필드가 많아 기본값 픽스처를 두고 필요한 것만 덮어쓴다.
function makeAttendee(over: Partial<AttendeeWithRoom> = {}): AttendeeWithRoom {
  seq += 1;
  return {
    id: `a${seq}`,
    korean_name: `사람${seq}`,
    english_name: null,
    district: null,
    gender: "male",
    role: "member",
    is_householder: false,
    householder_id: null,
    retreat_group: null,
    is_group_leader: false,
    note: null,
    email: null,
    phone: null,
    room_id: null,
    requested_room_type_id: null,
    language: "ko",
    is_under_6: false,
    attendance: "full",
    pickup_location: null,
    arrival_at: null,
    departure_at: null,
    paid: false,
    paid_at: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    rooms: null,
    requested_room_type: null,
    ...over,
  };
}

test("householdOccupants: 6세 미만은 정원 집계에서 제외", () => {
  const head = makeAttendee({ id: "h1", is_householder: true });
  const adult = makeAttendee({ householder_id: "h1" });
  const baby = makeAttendee({ householder_id: "h1", is_under_6: true });
  const [hh] = groupHouseholds([head, adult, baby]);
  assert.equal(householdOccupants(hh).length, 2);
});

test("soleGender: 전원 동일 성별이면 그 성별", () => {
  const a = makeAttendee({ gender: "male" });
  const b = makeAttendee({ gender: "male" });
  assert.equal(soleGender([a, b]), "male");
});

test("soleGender: 혼성이면 null", () => {
  const a = makeAttendee({ gender: "male" });
  const b = makeAttendee({ gender: "female" });
  assert.equal(soleGender([a, b]), null);
});

test("soleGender: 성별 미입력이 섞이면 null", () => {
  const a = makeAttendee({ gender: "male" });
  const b = makeAttendee({ gender: null });
  assert.equal(soleGender([a, b]), null);
});

test("soleGender: 빈 배열이면 null", () => {
  assert.equal(soleGender([]), null);
});
```

- [ ] **Step 2: 테스트가 실패하는 것 확인**

Run: `npm test`
Expected: FAIL — `householdOccupants` / `soleGender` 가 export되지 않음

- [ ] **Step 3: 두 헬퍼 구현**

`src/lib/hotel-estimate.ts` 의 import 줄을 교체하고 헬퍼를 추가한다:

```ts
import type { AttendeeWithRoom, Household } from "./fees.ts";
import type { Gender } from "./types.ts";
```

`estimateHotelRooms` 위에 추가:

```ts
// 정원에 집계되는 가구원. 6세 미만은 회비·정원 규정상 제외(호텔엔 별도 고지).
export function householdOccupants(h: Household): AttendeeWithRoom[] {
  return [h.head, ...h.members].filter((p) => !p.is_under_6);
}

// 성별 합방 가능 여부. 전원 동일 성별일 때만 그 성별을 반환.
// 혼성(부부 등)이나 성별 미입력이 섞이면 null → 합방 불가, 전용방 처리.
export function soleGender(occupants: AttendeeWithRoom[]): Gender | null {
  const first = occupants[0]?.gender;
  if (!first) return null;
  return occupants.every((p) => p.gender === first) ? first : null;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: 테스트 6 pass

- [ ] **Step 5: 커밋**

```bash
git add src/lib/hotel-estimate.ts src/lib/hotel-estimate.test.ts
git commit -m "$(cat <<'EOF'
feat: 가구 정원 집계·성별 합방 판정 헬퍼

householdOccupants(6세미만 제외) + soleGender(혼성·미입력은 합방 불가).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `estimateHotelRooms()` 본체

스펙의 표 전체를 구현한다. 이 태스크가 기능의 핵심이다.

**Files:**
- Modify: `src/lib/hotel-estimate.ts`
- Test: `src/lib/hotel-estimate.test.ts`

**Interfaces:**
- Consumes: `householdOccupants`, `soleGender` (Task 2), `groupHouseholds`·`withHouseholdRoomType`·`RoomTypeLite` (`src/lib/fees.ts`)
- Produces: `estimateHotelRooms(attendees: AttendeeWithRoom[], assumedCapacity: AssumedCapacity): HotelEstimate` — 필드는 Task 1에 정의된 그대로

**계산 규칙 요약 (구현 시 참조):**

| 가구 조건 | 처리 | 방 수 |
|---|---|---|
| occupancy 0 (전원 6세 미만) | 버킷에 넣지 않음 | 0, `zeroOccupancyHouseholds++` |
| occupancy ≥ 3 | 가족 전용방 | `ceil(occ / capacity)` |
| occupancy ≤ 2, 동일 성별 | 성별 합방 풀 | 풀 합계에서 `ceil(합계 / capacity)` |
| occupancy ≤ 2, 혼성 | 가족 전용방 | 1 |
| occupancy ≤ 2, 성별 미입력 포함 | 가족 전용방 | 1, `unknownGenderHouseholds++` |

- [ ] **Step 1: 실패 테스트 작성 (본체 전 분기)**

`src/lib/hotel-estimate.test.ts` 에 추가한다. `TWO`/`THREE`/`FOUR` 는 가구주 선택 타입 픽스처.

```ts
const TWO = { name: "2인실", price_per_person: 300, capacity: 2 };
const THREE = { name: "3인실", price_per_person: 250, capacity: 3 };
const FOUR = { name: "4인실", price_per_person: 200, capacity: 4 };

// 가구 1개 생성: head + (size-1)명. type=null 이면 미선택 가구.
function household(
  id: string,
  size: number,
  type: { name: string; price_per_person: number; capacity: number } | null,
  over: Partial<AttendeeWithRoom> = {},
): AttendeeWithRoom[] {
  const head = makeAttendee({
    id,
    is_householder: true,
    requested_room_type_id: type ? `rt-${type.capacity}` : null,
    requested_room_type: type,
    ...over,
  });
  const rest = Array.from({ length: size - 1 }, () =>
    makeAttendee({ householder_id: id, ...over }),
  );
  return [head, ...rest];
}

test("occupancy 5명 / 4인실 → ceil = 2방", () => {
  const est = estimateHotelRooms(household("h1", 5, FOUR), 4);
  assert.equal(est.decided.length, 1);
  assert.equal(est.decided[0].capacity, 4);
  assert.equal(est.decided[0].familyRooms, 2);
  assert.equal(est.decided[0].sharedRooms, 0);
  assert.equal(est.totalRooms, 2);
  assert.equal(est.totalPeople, 5);
});

test("성인 4 + 유아 1 / 4인실 → 1방 (유아는 정원 미집계)", () => {
  const rows = household("h1", 4, FOUR);
  rows.push(makeAttendee({ householder_id: "h1", is_under_6: true }));
  const est = estimateHotelRooms(rows, 4);
  assert.equal(est.totalRooms, 1);
  assert.equal(est.totalPeople, 4);
  assert.equal(est.under6, 1);
});

test("동일 성별 1인 가구 3개 / 4인실 → 합방 1방", () => {
  const rows = [
    ...household("h1", 1, FOUR, { gender: "male" }),
    ...household("h2", 1, FOUR, { gender: "male" }),
    ...household("h3", 1, FOUR, { gender: "male" }),
  ];
  const est = estimateHotelRooms(rows, 4);
  assert.equal(est.decided[0].sharedRooms, 1);
  assert.equal(est.decided[0].familyRooms, 0);
  assert.equal(est.totalRooms, 1);
});

test("남/여 합방 풀은 서로 섞이지 않음", () => {
  const rows = [
    ...household("h1", 1, FOUR, { gender: "male" }),
    ...household("h2", 1, FOUR, { gender: "female" }),
  ];
  const est = estimateHotelRooms(rows, 4);
  assert.equal(est.totalRooms, 2);
});

test("혼성 2인 가구(부부)는 전용방 1개, unknownGender 아님", () => {
  const rows = household("h1", 2, FOUR);
  rows[1] = makeAttendee({ householder_id: "h1", gender: "female" });
  const est = estimateHotelRooms(rows, 4);
  assert.equal(est.decided[0].familyRooms, 1);
  assert.equal(est.decided[0].sharedRooms, 0);
  assert.equal(est.unknownGenderHouseholds, 0);
});

test("성별 미입력 1인 가구는 전용방 + unknownGenderHouseholds 증가", () => {
  const est = estimateHotelRooms(
    household("h1", 1, FOUR, { gender: null }),
    4,
  );
  assert.equal(est.decided[0].familyRooms, 1);
  assert.equal(est.unknownGenderHouseholds, 1);
});

test("전원 6세 미만 가구는 버킷 제외 + zeroOccupancy 증가", () => {
  const est = estimateHotelRooms(
    household("h1", 2, FOUR, { is_under_6: true }),
    4,
  );
  assert.equal(est.decided.length, 0);
  assert.equal(est.totalRooms, 0);
  assert.equal(est.zeroOccupancyHouseholds, 1);
});

test("확정과 가정은 같은 성별·정원이어도 합방하지 않음", () => {
  const rows = [
    ...household("h1", 1, FOUR, { gender: "male" }),
    ...household("h2", 1, null, { gender: "male" }),
  ];
  const est = estimateHotelRooms(rows, 4);
  assert.equal(est.decided[0].sharedRooms, 1);
  assert.equal(est.assumed?.sharedRooms, 1);
  assert.equal(est.totalRooms, 2);
});

test("assumedCapacity 전환은 가정 버킷만 바꾼다", () => {
  const rows = [
    ...household("h1", 3, TWO),
    ...household("h2", 6, null),
  ];
  const at4 = estimateHotelRooms(rows, 4);
  const at2 = estimateHotelRooms(rows, 2);
  assert.equal(at4.assumed?.rooms, 2); // ceil(6/4)
  assert.equal(at2.assumed?.rooms, 3); // ceil(6/2)
  assert.equal(at4.decided[0].rooms, at2.decided[0].rooms); // ceil(3/2)=2
  assert.equal(at2.assumedCapacity, 2);
});

test("decided 버킷은 capacity 오름차순", () => {
  const rows = [
    ...household("h1", 3, FOUR),
    ...household("h2", 3, TWO),
    ...household("h3", 3, THREE),
  ];
  const est = estimateHotelRooms(rows, 4);
  assert.deepEqual(
    est.decided.map((b) => b.capacity),
    [2, 3, 4],
  );
});

test("partial 참석자도 방 산정에 포함되고 별도 카운트된다", () => {
  const rows = household("h1", 3, FOUR, { attendance: "partial" });
  const est = estimateHotelRooms(rows, 4);
  assert.equal(est.totalPeople, 3);
  assert.equal(est.partialCount, 3);
});

test("가구에 연결되지 않은 행은 unlinkedAttendees로 드러난다", () => {
  const orphan = makeAttendee({ is_householder: false, householder_id: null });
  const est = estimateHotelRooms([orphan], 4);
  assert.equal(est.unlinkedAttendees, 1);
  assert.equal(est.totalRooms, 0);
});
```

- [ ] **Step 2: 테스트가 실패하는 것 확인**

Run: `npm test`
Expected: FAIL — 새 테스트들이 전부 0/null을 받아 실패 (본체가 아직 스텁)

- [ ] **Step 3: 본체 구현**

`src/lib/hotel-estimate.ts` 의 import를 아래로 교체:

```ts
import {
  groupHouseholds,
  withHouseholdRoomType,
  type AttendeeWithRoom,
  type Household,
} from "./fees.ts";
import type { Gender } from "./types.ts";
```

그리고 `estimateHotelRooms` 스텁을 아래로 **전부 교체**한다:

```ts
// 버킷별 누산기. pool = 성별 → 합방 대상 인원 합.
interface Acc {
  households: number;
  people: number;
  familyRooms: number;
  pool: Map<Gender, number>;
}

function newAcc(): Acc {
  return { households: 0, people: 0, familyRooms: 0, pool: new Map() };
}

function finishAcc(acc: Acc, capacity: number): EstimateBucket {
  let sharedRooms = 0;
  for (const people of acc.pool.values()) {
    sharedRooms += Math.ceil(people / capacity);
  }
  return {
    capacity,
    households: acc.households,
    people: acc.people,
    familyRooms: acc.familyRooms,
    sharedRooms,
    rooms: acc.familyRooms + sharedRooms,
  };
}

export function estimateHotelRooms(
  attendees: AttendeeWithRoom[],
  assumedCapacity: AssumedCapacity,
): HotelEstimate {
  const rows = withHouseholdRoomType(attendees);
  const households = groupHouseholds(rows);

  const decidedAcc = new Map<number, Acc>();
  const assumedAcc = newAcc();
  let unknownGenderHouseholds = 0;
  let zeroOccupancyHouseholds = 0;

  for (const h of households) {
    const occupants = householdOccupants(h);
    if (occupants.length === 0) {
      zeroOccupancyHouseholds += 1;
      continue;
    }

    const chosen = h.head.requested_room_type?.capacity;
    // capacity 0/음수는 DB상 없어야 하지만 들어오면 ceil이 Infinity가 되므로 하한 1.
    const capacity = Math.max(1, chosen ?? assumedCapacity);

    let acc: Acc;
    if (chosen == null) {
      acc = assumedAcc;
    } else {
      const existing = decidedAcc.get(capacity);
      acc = existing ?? newAcc();
      if (!existing) decidedAcc.set(capacity, acc);
    }

    acc.households += 1;
    acc.people += occupants.length;

    if (occupants.length <= 2) {
      const g = soleGender(occupants);
      if (g) {
        acc.pool.set(g, (acc.pool.get(g) ?? 0) + occupants.length);
      } else {
        // 혼성(부부) 또는 성별 미입력 → 합방 불가, 전용방.
        acc.familyRooms += 1;
        if (occupants.some((p) => p.gender == null)) {
          unknownGenderHouseholds += 1;
        }
      }
    } else {
      acc.familyRooms += Math.ceil(occupants.length / capacity);
    }
  }

  const decided = [...decidedAcc.entries()]
    .sort(([a], [b]) => a - b)
    .map(([capacity, acc]) => finishAcc(acc, capacity));
  const assumed =
    assumedAcc.households > 0 ? finishAcc(assumedAcc, assumedCapacity) : null;

  const buckets = assumed ? [...decided, assumed] : decided;

  let totalRooms = 0;
  let totalPeople = 0;
  for (const b of buckets) {
    totalRooms += b.rooms;
    totalPeople += b.people;
  }

  // 참석자 단위 카운터는 한 번만 순회한다 (filter 3번 대신).
  let under6 = 0;
  let partialCount = 0;
  let unlinkedAttendees = 0;
  for (const a of rows) {
    if (a.is_under_6) under6 += 1;
    if (a.attendance === "partial") partialCount += 1;
    // 가구주도 아니고 가구주 링크도 없는 행 = 방 산정에서 누락됨. 조용히 빠지면
    // 호텔에 틀린 숫자를 주게 되므로 드러낸다. (0010 마이그레이션 이후 정상은 0)
    if (!a.is_householder && a.householder_id == null) unlinkedAttendees += 1;
  }

  return {
    decided,
    assumed,
    totalRooms,
    totalPeople,
    under6,
    partialCount,
    unknownGenderHouseholds,
    zeroOccupancyHouseholds,
    unlinkedAttendees,
    assumedCapacity,
  };
}
```

Task 1에서 `void attendees;` 를 넣었다면 이 교체로 사라진다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: 전체 pass (18개 전후)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/hotel-estimate.ts src/lib/hotel-estimate.test.ts
git commit -m "$(cat <<'EOF'
feat: 호텔 예약용 방 갯수 추정 estimateHotelRooms()

가구 단위 전용방 + 1~2인 동일성별 합방 풀, 6세미만 정원 미집계,
확정/가정 그룹 분리 집계, 미선택 가구는 가정 정원으로.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: i18n 키 (`HotelEstimate` 네임스페이스)

**Files:**
- Modify: `messages/ko.json`, `messages/en.json`, `messages/es.json`

**Interfaces:**
- Consumes: 없음
- Produces: `HotelEstimate` 네임스페이스 — Task 5의 `useTranslations("HotelEstimate")` 가 이 키들을 쓴다

- [ ] **Step 1: 세 파일에 `HotelEstimate` 네임스페이스 추가**

기존 `"Pickup"` 네임스페이스 **뒤**, `"Footer"` **앞**에 넣는다 (파일 구조 일관성).

`messages/ko.json`:

```json
  "HotelEstimate": {
    "title": "호텔 제출용 예상 방 갯수",
    "subtitle": "예약 협상용 추정치 — 실제 배치는 방 배치 화면에서",
    "totalRooms": "총 예상 방 {count}개",
    "assumptionLabel": "미선택 가구 가정",
    "capacityRoom": "{n}인실",
    "colType": "구분",
    "colHouseholds": "가구",
    "colPeople": "인원",
    "colRooms": "방",
    "decidedRow": "{room} (확정)",
    "assumedRow": "{room} (가정)",
    "totalRow": "합계",
    "roomBreakdown": "가족 {family} + 합방 {shared}",
    "households": "{count}가구",
    "people": "{count}명",
    "noteUnder6": "6세 미만 {count}명은 정원 미집계 — 호텔에 유아 동반 별도 고지",
    "notePartial": "부분참석 {count}명도 숙박으로 포함",
    "noteUnknownGender": "성별 미입력 {count}가구는 합방 불가로 전용방 처리 — 성별을 채우면 예상치가 줄어듭니다",
    "noteZeroOccupancy": "전원 6세 미만 {count}가구는 방 산정 제외",
    "noteUnlinked": "⚠ 가구 미연결 {count}명은 방 산정에서 빠졌습니다 — 데이터 확인 필요",
    "rule": "가족은 전용방, 1~2인 소가구는 같은 성별끼리 합방 기준"
  },
```

`messages/en.json`:

```json
  "HotelEstimate": {
    "title": "Estimated rooms for the hotel",
    "subtitle": "Reservation estimate — actual placement is on the assignments page",
    "totalRooms": "{count} rooms estimated",
    "assumptionLabel": "Assumption for undecided",
    "capacityRoom": "{n}-person room",
    "colType": "Type",
    "colHouseholds": "Households",
    "colPeople": "People",
    "colRooms": "Rooms",
    "decidedRow": "{room} (confirmed)",
    "assumedRow": "{room} (assumed)",
    "totalRow": "Total",
    "roomBreakdown": "{family} family + {shared} shared",
    "households": "{count}",
    "people": "{count}",
    "noteUnder6": "{count} under 6 excluded from occupancy — notify the hotel separately about infants",
    "notePartial": "{count} partial attendees counted as staying overnight",
    "noteUnknownGender": "{count} households with no gender recorded get their own room — filling gender in lowers the estimate",
    "noteZeroOccupancy": "{count} households of only under-6 children excluded",
    "noteUnlinked": "⚠ {count} attendees not linked to a household were left out — check the data",
    "rule": "Families get their own room; 1–2 person households share by gender"
  },
```

`messages/es.json`:

```json
  "HotelEstimate": {
    "title": "Habitaciones estimadas para el hotel",
    "subtitle": "Estimación para la reserva — la asignación real está en la página de asignaciones",
    "totalRooms": "{count} habitaciones estimadas",
    "assumptionLabel": "Supuesto para los indecisos",
    "capacityRoom": "Habitación de {n}",
    "colType": "Tipo",
    "colHouseholds": "Familias",
    "colPeople": "Personas",
    "colRooms": "Habitaciones",
    "decidedRow": "{room} (confirmado)",
    "assumedRow": "{room} (supuesto)",
    "totalRow": "Total",
    "roomBreakdown": "{family} familiar + {shared} compartida",
    "households": "{count}",
    "people": "{count}",
    "noteUnder6": "{count} menores de 6 años no cuentan para la ocupación — avisar al hotel por separado",
    "notePartial": "{count} asistentes parciales contados como alojados",
    "noteUnknownGender": "{count} familias sin sexo registrado reciben habitación propia — completarlo reduce la estimación",
    "noteZeroOccupancy": "{count} familias solo de menores de 6 años excluidas",
    "noteUnlinked": "⚠ {count} asistentes sin familia vinculada quedaron fuera — revisar los datos",
    "rule": "Las familias tienen habitación propia; las de 1–2 personas se agrupan por sexo"
  },
```

- [ ] **Step 2: 세 파일이 유효한 JSON이고 키 집합이 동일한지 확인**

Run:
```bash
python3 -c "
import json
ks=[set(json.load(open('messages/%s.json'%l))['HotelEstimate']) for l in ('ko','en','es')]
assert ks[0]==ks[1]==ks[2], [ks[0]^ks[1], ks[0]^ks[2]]
print('ok', len(ks[0]), 'keys')
"
```
Expected: `ok 21 keys`

- [ ] **Step 3: 커밋**

```bash
git add messages/ko.json messages/en.json messages/es.json
git commit -m "$(cat <<'EOF'
i18n: HotelEstimate 네임스페이스 (ko/en/es)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `HotelEstimate` 컴포넌트 + `/admin` 연결

**Files:**
- Create: `src/components/HotelEstimate.tsx`
- Modify: `src/app/[locale]/admin/(protected)/page.tsx`

**Interfaces:**
- Consumes: `estimateHotelRooms`·`ASSUMED_CAPACITIES`·`HotelEstimate`(타입)·`AssumedCapacity`·`EstimateBucket` (Task 1·3), `HotelEstimate` i18n 네임스페이스 (Task 4)
- Produces: `<HotelEstimateSection estimates={HotelEstimate[]} />`

**주의:** 타입 `HotelEstimate` 와 컴포넌트 이름이 충돌하므로 컴포넌트는
**`HotelEstimateSection`** 으로 명명한다.

- [ ] **Step 1: 컴포넌트 작성**

`src/components/HotelEstimate.tsx` 생성:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  ASSUMED_CAPACITIES,
  type AssumedCapacity,
  type EstimateBucket,
  type HotelEstimate,
} from "@/lib/hotel-estimate";

// 서버가 2/3/4인실 세 시나리오를 미리 계산해 넘긴다(PII를 클라이언트로 보내지 않기 위해).
export function HotelEstimateSection({
  estimates,
}: {
  estimates: HotelEstimate[];
}) {
  const t = useTranslations("HotelEstimate");
  const [assumed, setAssumed] = useState<AssumedCapacity>(4);
  const est =
    estimates.find((e) => e.assumedCapacity === assumed) ?? estimates[0];

  if (!est) return null;

  const rows: { label: string; bucket: EstimateBucket }[] = [
    ...est.decided.map((bucket) => ({
      label: t("decidedRow", { room: t("capacityRoom", { n: bucket.capacity }) }),
      bucket,
    })),
    ...(est.assumed
      ? [
          {
            label: t("assumedRow", {
              room: t("capacityRoom", { n: est.assumed.capacity }),
            }),
            bucket: est.assumed,
          },
        ]
      : []),
  ];

  const notes: string[] = [];
  if (est.unlinkedAttendees > 0)
    notes.push(t("noteUnlinked", { count: est.unlinkedAttendees }));
  if (est.under6 > 0) notes.push(t("noteUnder6", { count: est.under6 }));
  if (est.partialCount > 0)
    notes.push(t("notePartial", { count: est.partialCount }));
  if (est.unknownGenderHouseholds > 0)
    notes.push(t("noteUnknownGender", { count: est.unknownGenderHouseholds }));
  if (est.zeroOccupancyHouseholds > 0)
    notes.push(t("noteZeroOccupancy", { count: est.zeroOccupancyHouseholds }));

  return (
    <section className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t("title")}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{t("subtitle")}</p>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">
            {t("assumptionLabel")}
          </span>
          <div className="flex gap-1">
            {ASSUMED_CAPACITIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setAssumed(c)}
                aria-pressed={c === assumed}
                className={
                  c === assumed
                    ? "rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white"
                    : "rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200"
                }
              >
                {t("capacityRoom", { n: c })}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-4 text-3xl font-bold text-slate-900">
        {t("totalRooms", { count: est.totalRooms })}
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[28rem] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3 font-medium">{t("colType")}</th>
              <th className="py-2 pr-3 text-right font-medium">
                {t("colHouseholds")}
              </th>
              <th className="py-2 pr-3 text-right font-medium">
                {t("colPeople")}
              </th>
              <th className="py-2 text-right font-medium">{t("colRooms")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="py-2 pr-3">
                  <span className="text-slate-800">{r.label}</span>
                  <span className="block text-xs text-slate-400">
                    {t("roomBreakdown", {
                      family: r.bucket.familyRooms,
                      shared: r.bucket.sharedRooms,
                    })}
                  </span>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-slate-600">
                  {t("households", { count: r.bucket.households })}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-slate-600">
                  {t("people", { count: r.bucket.people })}
                </td>
                <td className="py-2 text-right font-semibold tabular-nums text-slate-900">
                  {r.bucket.rooms}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 font-semibold text-slate-900">
              <td className="py-2 pr-3">{t("totalRow")}</td>
              <td className="py-2 pr-3 text-right tabular-nums">—</td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {t("people", { count: est.totalPeople })}
              </td>
              <td className="py-2 text-right tabular-nums">{est.totalRooms}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-3 text-xs text-slate-500">{t("rule")}</p>
      {notes.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-slate-500">
          {notes.map((n) => (
            <li key={n}>· {n}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 2: `/admin` 페이지에 연결**

`src/app/[locale]/admin/(protected)/page.tsx` 를 3곳 수정한다.

(a) import 추가 (기존 import 블록 끝에):

```ts
import { HotelEstimateSection } from "@/components/HotelEstimate";
import { ASSUMED_CAPACITIES, estimateHotelRooms } from "@/lib/hotel-estimate";
```

(b) attendees select의 `requested_room_type` embed에 `capacity` 추가.
아래 줄을

```ts
          "*, rooms(label, room_types(name, price_per_person)), requested_room_type:room_types!requested_room_type_id(name, price_per_person)",
```

이렇게 바꾼다 (`requested_room_type` 쪽에만 `capacity` 추가):

```ts
          "*, rooms(label, room_types(name, price_per_person)), requested_room_type:room_types!requested_room_type_id(name, price_per_person, capacity)",
```

⚠️ `rooms(label, room_types(...))` 쪽은 건드리지 않는다 — 회비 계산 전용 경로다.

(c) `const stats = computeDashboard(...)` 호출 **뒤**에 추가:

```ts
  const attendeeRows = (aData as AttendeeWithRoom[] | null) ?? [];
  const estimates = ASSUMED_CAPACITIES.map((c) =>
    estimateHotelRooms(attendeeRows, c),
  );
```

(d) `<AdminDashboard stats={stats} />` 를 감싼 div **뒤**에 섹션 추가:

```tsx
      <div className="mt-6">
        <HotelEstimateSection estimates={estimates} />
      </div>
```

- [ ] **Step 3: 타입체크·린트·빌드 확인**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: 전부 통과. `/[locale]/admin` 이 `ƒ (Dynamic)` 으로 남아 있어야 한다.

- [ ] **Step 4: 커밋**

```bash
git add src/components/HotelEstimate.tsx "src/app/[locale]/admin/(protected)/page.tsx"
git commit -m "$(cat <<'EOF'
feat(admin): 대시보드에 호텔 제출용 예상 방 갯수 섹션

서버가 2/3/4인실 가정 3시나리오를 미리 계산(PII 미전송),
클라이언트는 토글로 표시만 전환.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 런타임 검증 (로컬 시드 + 실제 화면 확인)

타입체크·빌드 통과는 런타임을 보장하지 않는다(이 저장소의 과거 교훈:
라우트 슬러그 충돌·`"use server"` 타입 재수출은 빌드 green인데 런타임 500).
실제 데이터를 넣고 `/admin` 을 열어 눈으로 확인한다.

**Files:**
- Create: `scratchpad/hotel-estimate-seed.sql` (커밋하지 않음 — 로컬 검증용)

**Interfaces:**
- Consumes: Task 5까지의 전체 기능
- Produces: 검증 완료 (산출물 없음)

- [ ] **Step 1: 로컬 Supabase 기동 + 마이그레이션 최신화**

```bash
supabase start
supabase db reset
```

`db reset` 은 0001~0022 마이그레이션을 전부 재적용한다. 로컬 DB는 프로덕션과
분리돼 있고 현재 attendees가 0행이라 잃을 데이터가 없다.

- [ ] **Step 2: 검증용 시드 작성**

`scratchpad/hotel-estimate-seed.sql`:

```sql
-- 호텔 방 갯수 추정 검증용 시드. 모든 분기를 한 화면에서 확인.
-- 4인실 5명 가족 → 2방 / 2인실 부부(혼성) → 1방 / 4인실 남 1인 x3 → 합방 1방
-- 미선택 6명 가족 → 가정 / 성별 미입력 1인 → 전용방 / 성인4+유아1 → 1방
with t as (
  select
    (select id from room_types where capacity = 2) as t2,
    (select id from room_types where capacity = 4) as t4
)
insert into attendees
  (id, korean_name, gender, role, is_householder, householder_id,
   requested_room_type_id, is_under_6, attendance, language)
select * from (values
  -- 4인실 5인 가족 → ceil(5/4) = 2방
  ('11111111-1111-1111-1111-111111111101'::uuid, '김가장', 'male'::gender_t, 'member'::role_t, true,  null::uuid, (select t4 from t), false, 'full'::attendance_t, 'ko'::language_t),
  ('11111111-1111-1111-1111-111111111102'::uuid, '김배우자', 'female'::gender_t, 'member'::role_t, false, '11111111-1111-1111-1111-111111111101'::uuid, null, false, 'full'::attendance_t, 'ko'::language_t),
  ('11111111-1111-1111-1111-111111111103'::uuid, '김자녀1', 'male'::gender_t, 'student'::role_t, false, '11111111-1111-1111-1111-111111111101'::uuid, null, false, 'full'::attendance_t, 'ko'::language_t),
  ('11111111-1111-1111-1111-111111111104'::uuid, '김자녀2', 'female'::gender_t, 'student'::role_t, false, '11111111-1111-1111-1111-111111111101'::uuid, null, false, 'full'::attendance_t, 'ko'::language_t),
  ('11111111-1111-1111-1111-111111111105'::uuid, '김자녀3', 'male'::gender_t, 'child'::role_t, false, '11111111-1111-1111-1111-111111111101'::uuid, null, false, 'full'::attendance_t, 'ko'::language_t),
  -- 2인실 부부(혼성) → 전용방 1
  ('11111111-1111-1111-1111-111111111201'::uuid, '박가장', 'male'::gender_t, 'elder'::role_t, true, null::uuid, (select t2 from t), false, 'full'::attendance_t, 'ko'::language_t),
  ('11111111-1111-1111-1111-111111111202'::uuid, '박배우자', 'female'::gender_t, 'gwonsa'::role_t, false, '11111111-1111-1111-1111-111111111201'::uuid, null, false, 'full'::attendance_t, 'ko'::language_t),
  -- 4인실 남성 1인 가구 x3 → 합방 1방
  ('11111111-1111-1111-1111-111111111301'::uuid, '독신남1', 'male'::gender_t, 'member'::role_t, true, null::uuid, (select t4 from t), false, 'full'::attendance_t, 'ko'::language_t),
  ('11111111-1111-1111-1111-111111111302'::uuid, '독신남2', 'male'::gender_t, 'member'::role_t, true, null::uuid, (select t4 from t), false, 'partial'::attendance_t, 'ko'::language_t),
  ('11111111-1111-1111-1111-111111111303'::uuid, '독신남3', 'male'::gender_t, 'member'::role_t, true, null::uuid, (select t4 from t), false, 'full'::attendance_t, 'ko'::language_t),
  -- 성별 미입력 1인 → 전용방 + unknownGender 경고
  ('11111111-1111-1111-1111-111111111401'::uuid, '미입력', null::gender_t, 'member'::role_t, true, null::uuid, (select t4 from t), false, 'full'::attendance_t, 'ko'::language_t),
  -- 4인실 성인4 + 유아1 → 1방 (유아 미집계)
  ('11111111-1111-1111-1111-111111111501'::uuid, '이가장', 'male'::gender_t, 'deacon'::role_t, true, null::uuid, (select t4 from t), false, 'full'::attendance_t, 'ko'::language_t),
  ('11111111-1111-1111-1111-111111111502'::uuid, '이배우자', 'female'::gender_t, 'member'::role_t, false, '11111111-1111-1111-1111-111111111501'::uuid, null, false, 'full'::attendance_t, 'ko'::language_t),
  ('11111111-1111-1111-1111-111111111503'::uuid, '이자녀1', 'male'::gender_t, 'student'::role_t, false, '11111111-1111-1111-1111-111111111501'::uuid, null, false, 'full'::attendance_t, 'ko'::language_t),
  ('11111111-1111-1111-1111-111111111504'::uuid, '이자녀2', 'female'::gender_t, 'student'::role_t, false, '11111111-1111-1111-1111-111111111501'::uuid, null, false, 'full'::attendance_t, 'ko'::language_t),
  ('11111111-1111-1111-1111-111111111505'::uuid, '이유아', 'male'::gender_t, 'child'::role_t, false, '11111111-1111-1111-1111-111111111501'::uuid, null, true, 'full'::attendance_t, 'ko'::language_t),
  -- 미선택 6인 가족 → 가정 버킷 (4인실 가정 시 2방, 2인실 가정 시 3방)
  ('11111111-1111-1111-1111-111111111601'::uuid, '최가장', 'male'::gender_t, 'member'::role_t, true, null::uuid, null, false, 'full'::attendance_t, 'ko'::language_t),
  ('11111111-1111-1111-1111-111111111602'::uuid, '최가족2', 'female'::gender_t, 'member'::role_t, false, '11111111-1111-1111-1111-111111111601'::uuid, null, false, 'full'::attendance_t, 'ko'::language_t),
  ('11111111-1111-1111-1111-111111111603'::uuid, '최가족3', 'male'::gender_t, 'member'::role_t, false, '11111111-1111-1111-1111-111111111601'::uuid, null, false, 'full'::attendance_t, 'ko'::language_t),
  ('11111111-1111-1111-1111-111111111604'::uuid, '최가족4', 'female'::gender_t, 'member'::role_t, false, '11111111-1111-1111-1111-111111111601'::uuid, null, false, 'full'::attendance_t, 'ko'::language_t),
  ('11111111-1111-1111-1111-111111111605'::uuid, '최가족5', 'male'::gender_t, 'member'::role_t, false, '11111111-1111-1111-1111-111111111601'::uuid, null, false, 'full'::attendance_t, 'ko'::language_t),
  ('11111111-1111-1111-1111-111111111606'::uuid, '최가족6', 'female'::gender_t, 'member'::role_t, false, '11111111-1111-1111-1111-111111111601'::uuid, null, false, 'full'::attendance_t, 'ko'::language_t)
) as v;
```

⚠️ enum 타입 이름(`gender_t` 등)이 실제 스키마와 다를 수 있다. 먼저 확인한다:

```bash
docker exec supabase_db_retreat2026 psql -U postgres -d postgres -c "\dT+ public.*"
```

실제 이름에 맞춰 캐스트를 고친 뒤 실행한다. 캐스트를 아예 빼고 문자열 리터럴만
써도 Postgres가 대개 추론하므로, 타입 이름이 헷갈리면 캐스트를 제거하는 편이 빠르다.

- [ ] **Step 2b: 시드 실행 + 기대값 손계산 확인**

```bash
docker exec -i supabase_db_retreat2026 psql -U postgres -d postgres < scratchpad/hotel-estimate-seed.sql
```

4인실 가정 기준 기대값:
- 확정 2인실: 1가구 2명 → 1방 (혼성 전용방)
- 확정 4인실: 김가족 2방 + 이가족 1방 + 성별미입력 1방 = 가족방 4, 독신남3 합방 1방 → **5방**, 인원 5+4+3+1 = 13명
- 가정 4인실: 최가족 6명 → 2방
- **합계 8방 / 정원 집계 인원 21명 / 6세 미만 1명 / 부분참석 1명 / 성별 미입력 1가구**

2인실로 토글하면 가정 버킷만 2방 → 3방으로 바뀌어 **합계 9방**.

- [ ] **Step 3: 개발 서버 기동 + 관리자 로그인**

```bash
npm run dev
```

`http://localhost:3000/admin` 접속. 로그인이 필요하면 매직링크/Google 대신
로컬 Mailpit(http://127.0.0.1:54324)으로 처리한다. 로컬 `admins` 에
관리자 이메일이 있어야 하고, `admins` 추가 후에는 **재로그인**해야 클레임이 붙는다.

- [ ] **Step 4: 화면 확인 (눈으로)**

확인 항목:
1. 섹션이 대시보드 카드들 아래에 렌더된다
2. 총 예상 방 갯수가 **8개** (4인실 가정 기본값)
3. 2인실 토글 → **9개** 로 즉시 바뀐다, 확정 행은 그대로
4. 확정 4인실 행 부제가 `가족 4 + 합방 1`
5. 각주에 6세 미만 1명 / 부분참석 1명 / 성별 미입력 1가구가 보이고,
   값이 0인 각주(`noteUnlinked`, `noteZeroOccupancy`)는 **안 보인다**
6. `/en/admin` 과 `/es/admin` 에서 라벨이 번역돼 나온다 (키 그대로 노출되면 안 됨)
7. 브라우저 콘솔에 에러·경고 없음
8. 좁은 화면(모바일 폭)에서 표가 가로 스크롤되고 페이지 자체는 안 깨진다

- [ ] **Step 5: 시드 정리**

```bash
docker exec supabase_db_retreat2026 psql -U postgres -d postgres -c \
  "delete from attendees where id::text like '11111111-1111-1111-1111-1111111111%';"
```

`scratchpad/` 는 커밋 대상이 아니므로 파일은 남겨둬도 무해하다.

- [ ] **Step 6: 최종 확인 + 필요 시 수정 커밋**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`

화면 확인에서 문제가 나왔으면 고치고 커밋한다. 문제가 없으면 새 커밋 없이 종료.

---

## Self-Review

**스펙 커버리지 확인:**

| 스펙 항목 | 구현 태스크 |
|---|---|
| 가구 단위 + 1~2인 성별 합방 | Task 2 (`soleGender`) + Task 3 (pool) |
| 6세 미만 정원 미집계 | Task 2 (`householdOccupants`) |
| 미선택 가정 2/3/4 토글, 기본 4인실 | Task 3 (`assumedCapacity`) + Task 5 (토글 state) |
| 부분참석 전원 숙박 + 별도 표시 | Task 3 (`partialCount`) + Task 4/5 (`notePartial`) |
| 확정/가정 분리, 합방 안 함 | Task 3 (`decidedAcc` vs `assumedAcc`) + 전용 테스트 |
| occupancy 0 가구 버킷 제외 | Task 3 (`zeroOccupancyHouseholds`) + 전용 테스트 |
| 성별 미입력 전용방 + 노출 | Task 3 (`unknownGenderHouseholds`) + Task 4/5 각주 |
| `RoomTypeLite.capacity` + embed | Task 1 (타입) + Task 5 Step 2b (쿼리) |
| i18n ko/en/es | Task 4 |
| 각주 0이면 숨김 | Task 5 (`notes` 배열 조건부 push) |
| capacity 라벨을 i18n으로 생성 | Task 4 (`capacityRoom`) + Task 5 |
| 단위 테스트 8개 분기 | Task 3 Step 1 (13개 테스트로 커버) |
| 런타임 검증 | Task 6 |
| 마이그레이션 없음 | 어느 태스크도 `supabase/migrations/` 를 건드리지 않음 |

**스펙에 없었지만 추가한 것:** `unlinkedAttendees`. 가구주도 아니고 가구주 링크도 없는
행은 `groupHouseholds` 가 조용히 버리는데, 그러면 호텔에 적은 숫자를 주게 된다.
드러내는 편이 안전하다.

**타입 일관성:** `RoomTypeLite.capacity`(Task 1) → `h.head.requested_room_type?.capacity`(Task 3) →
쿼리 embed `capacity`(Task 5) 일치. 컴포넌트는 타입명 충돌을 피해 `HotelEstimateSection`,
파일명은 `HotelEstimate.tsx` — Task 5 안에서 일관.
`ASSUMED_CAPACITIES`/`AssumedCapacity`/`EstimateBucket`/`HotelEstimate` 모두 Task 1에 정의된 이름 그대로 사용.
