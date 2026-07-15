# 성도 본인 가구 멤버 추가/삭제 + 회비 차액·환불 관리 — 설계

날짜: 2026-07-15

## 배경 / 문제

현재 성도 본인 수정(`/edit/manage`)은 **이미 등록한 가구 구성원의 정보만** 고칠 수 있다.
직접 운영하다 보니 다음이 불가능해서 문제가 됐다:

- 가족(가구 구성원)을 **추가**할 수 없다 (INSERT 경로 없음).
- 가족을 **삭제**할 수 없다 (DELETE는 RLS상 관리자 전용).
- 객실 타입은 `paid=true`면 변경이 막혀 있다 (guard 트리거 + 앱 로직).

또한 인원/타입이 바뀌면 회비 total이 달라지는데, 현재 `paid`는 **boolean만** 저장하고
납부 **금액**을 저장하지 않아 "얼마 더 내야 하는지 / 환불이 필요한지"를 계산할 수 없다.

## 목표

1. 성도가 본인 가구의 **비-가구주 멤버**를 자유롭게 추가/삭제한다.
2. 객실 타입을 납부 여부와 무관하게 변경할 수 있다.
3. 멤버/타입 변경으로 생긴 **부족분을 자동 계산**해 사용자에게 알리고, **가구주가 PayPal로 부족분(delta)만 추가 납입**할 수 있게 한다.
4. 이미 납부한 가구가 멤버를 빼서 **환불이 필요해지면 관리자가 확인**할 수 있게 기록한다.

## 확정된 결정사항 (brainstorming)

| 항목 | 결정 |
|---|---|
| 타입↔인원 관계 | **수동 + 정원 경고**. 타입은 사용자가 직접 선택, 인원수 > 타입 정원이면 안내만(비차단). 회비는 `타입 단가 × 인원수`로 자동 재계산. |
| 수정 범위 | **비-가구주 멤버만 추가/삭제**. 가구주(head) 삭제·가구 전체 삭제·가구주 변경은 관리자 전용 유지. |
| 차액 노출 | **인라인 잔액 + 정산 버튼**. 참석자 목록/대시보드에 가구별 잔액 표시, 관리자가 실수납/환불 후 "정산"으로 스냅샷 갱신. |
| 부족분 납부 | 가구주가 **PayPal로 delta 금액**만 추가 납입 (기존 PayPal 링크 로직 확장). |

## 회비 모델 (현행 유지 + 확장)

- 가구는 객실 타입 하나(`requested_room_type_id`, head 행)를 선택.
- `total = 선택 타입 price_per_person × (6세 이상 인원수)`.
- **신규**: `paid_amount` = 관리자가 납부 체크/정산한 **시점의 total 스냅샷**.
- `balance = total − paid_amount` (paid일 때만 의미):
  - `balance > 0` → 추가 납부 필요 (가구주 PayPal delta 결제).
  - `balance < 0` → 환불 필요 (관리자 처리).
  - `balance = 0` → 정산 완료.

## 데이터 모델 변경 — 마이그레이션 `0019_paid_amount.sql`

1. `alter table public.attendees add column paid_amount int;`  (nullable, head 행에만 의미)
2. **백필**: 기존 `paid=true` 가구주는 `paid_amount = 현재 계산 total`로 채워 잔액 0에서 출발.
   (프로덕션 데이터 안전 — 갑자기 환불/추가납부로 뜨지 않게)
3. **guard 트리거 재작성** (`guard_privileged_cols`):
   - 비관리자 보호 컬럼에 `paid_amount` 추가.
   - 기존 `if old.paid then new.requested_room_type_id := old.requested_room_type_id;` **제거**
     → 납부 후에도 성도가 타입 변경 가능.
   - 기존 보호 컬럼(paid, paid_at, retreat_group, is_group_leader, is_householder, householder_id, room_id, language)은 유지.
4. **`household_total(head_id uuid) returns int`** SQL 함수 (SECURITY DEFINER, search_path=public):
   - `선택 타입 단가 × (해당 가구 6세 이상 인원수)`. setPaid/reconcile/백필에서 재사용.
5. **`remove_my_member(member_id uuid)`** RPC (SECURITY DEFINER, grant authenticated):
   - `member_id` 행이 **호출자 가구의 비-가구주 멤버**인지 검증(`householder_id in (select my_attendee_ids())` 이고 `is_householder = false`).
   - 조건 충족 시 delete, 아니면 아무 것도 안 함(0 rows). head/타 가구는 거부.
6. **`my_household_fee()`** RPC: 반환에 `paid_amount int` 추가 (기존 total/type_selected/paid 유지, drop & recreate).

## 서버 액션

### 성도 (`src/app/[locale]/edit/actions.ts`)

- **`addMyMember(input: PersonInput): EditResult`**
  - `my_attendee_ids()`로 본인 가구주(head) 행 조회(기존 `updateMyRoomType`와 동일 로직).
  - `rowFor(input, { id: uuid, is_householder: false, email: null, householder_id: head.id })`로 INSERT.
  - 관리자 전용 컬럼(paid/paid_amount/retreat_group/is_group_leader)은 rowFor에 없어 기본값. 서버가 householder_id를 검증된 head로 강제(클라이언트 신뢰 안 함).
  - 이름 검증(`validatePerson`) 후 진행.
- **`removeMyMember(memberId: string): EditResult`** — `remove_my_member` RPC 호출.
- **`updateMyRoomType`** — `if (head.paid) return error` 블록 **제거** (타입 변경 항상 허용). 나머지 유지.

### 관리자 (`src/app/[locale]/admin/actions.ts`)

- **`setPaid(id, paid)`** 수정: `paid=true` → `paid_amount = household_total(id)` 스냅샷 동시 저장; `paid=false` → `paid_amount=null`.
- **`reconcilePayment(headId): {ok}`** 신규: admin 검증 후 `paid=true, paid_amount = household_total(headId)`로 갱신 → 잔액 0. (추가납부 수납·환불 지급 후 공통 정산)

## UI

### Self-edit (`src/components/EditForm.tsx`)

- 멤버 카드 목록 하단에 **"가족 추가"** 버튼 → 인라인 빈 `PersonFields` 폼(저장 시 `addMyMember`, 성공 시 `router.refresh()`).
- 각 **비-가구주** 멤버 카드에 **"삭제"** 버튼 + `confirm` 다이얼로그 → `removeMyMember`. 가구주 카드엔 삭제 버튼 없음.
- **정원 경고**: 6세 이상 인원수 > 선택 타입 `capacity`면 타입 select 아래에 안내(비차단). roomTypes에 capacity 이미 포함.

### 회비 카드 (`src/components/HouseholdFeeCard.tsx` + `manage/page.tsx`)

- props에 `paidAmount`(또는 계산된 `balance`) 추가.
- 표시 분기:
  - `!paid` → 현재대로 total + 미납 배지 + 전액 PayPal 링크.
  - `paid && balance > 0` → "추가 납부 $X 필요" + **delta 금액** PayPal 링크.
  - `paid && balance < 0` → "환불 예정 $Y (관리자 처리)" 안내(결제 링크 없음).
  - `paid && balance == 0` → "납부 완료" 배지.
- `manage/page.tsx`: PayPal 링크 생성 조건을 `!paid` → **`payableAmount > 0`**(미납 전액 또는 납부완료+부족분)으로 확장. `buildDonateUrl`의 amount = 결제해야 할 금액(delta 또는 전액).

### 관리자 목록/대시보드

- 참석자 목록(`AdminAttendeeTable`)·대시보드(`AdminDashboard`)에 가구별 **잔액** 표시:
  - 추가납부(balance>0, amber) / 환불필요(balance<0, rose) 강조, 0이면 비강조.
  - 잔액은 head 행의 `paid_amount`와 계산 total로 산출(`lib/fees.ts`에 헬퍼 추가).
- 목록에서 잔액 있는 가구에 **"정산"** 버튼 → `reconcilePayment`.

## `lib/fees.ts`

- `AttendeeWithRoom`/`Household`에 `paid_amount` 반영, `balance` 계산 헬퍼 추가:
  - `householdBalance(household): number | null` (paid && paid_amount 있을 때 `total − paid_amount`, 아니면 null).

## i18n (ko/en/es)

신규 문구: 가족 추가, 삭제, 삭제 확인, 정원 경고("N명인데 X인실입니다 — 더 큰 타입을 권장합니다"),
추가 납부 필요, 환불 예정, (관리자) 잔액/추가납부/환불필요/정산 버튼.

## 보안 / RLS 확인

- INSERT는 이미 anon/authenticated 공개(공개 등록) → 멤버 추가는 신규 노출 아님. 서버 액션이 `is_householder=false` + 검증된 `householder_id` 강제.
- DELETE는 관리자 전용 유지. 성도 삭제는 `remove_my_member` RPC(비-가구주+본인 가구만)로만.
- `paid_amount`는 guard 트리거로 비관리자 변경 차단.

## 테스트 / 검증

- 마이그레이션 로컬 적용(`supabase db reset` 또는 마이그레이션 실행) 후 시나리오:
  1. 2인 가구 $600 납부 → 자녀 추가 → 카드 "추가 $300", delta PayPal 링크 $300, 정원경고 표시.
  2. 관리자 목록 "+$300" → 정산 클릭 → 잔액 0.
  3. 납부 가구에서 멤버 삭제 → 카드 "환불 예정", 관리자 "환불필요" 표시 → 정산 후 0.
  4. 미납 가구 멤버 추가/삭제 → 전액만 재계산(잔액 로직 미개입).
  5. 성도가 head 삭제/타 가구 멤버 삭제 시도 → 거부(0 rows).
- `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## 범위 밖 (YAGNI)

- 부분 납부(여러 번 나눠 내기) — paid는 단일 boolean 유지, delta 1회 결제.
- 가구주 자가 변경/가구 병합 — 관리자 전용 유지.
- 삭제된 멤버 이력 감사 로그 — 잔액(음수)이 사실상의 신호 역할.
