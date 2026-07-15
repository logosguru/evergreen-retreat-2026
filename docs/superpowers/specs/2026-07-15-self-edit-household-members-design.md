# 성도 본인 가구 멤버 추가/삭제 + 회비 납입 원장(ledger) — 설계

날짜: 2026-07-15

## 배경 / 문제

현재 성도 본인 수정(`/edit/manage`)은 **이미 등록한 가구 구성원의 정보만** 고칠 수 있다.
직접 운영하다 보니 다음이 불가능해서 문제가 됐다:

- 가족(가구 구성원)을 **추가**할 수 없다 (INSERT 경로 없음).
- 가족을 **삭제**할 수 없다 (DELETE는 RLS상 관리자 전용).
- 객실 타입은 `paid=true`면 변경이 막혀 있다 (guard 트리거 + 앱 로직).

또한 인원/타입이 바뀌면 회비 total이 달라지는데, 현재 `paid`는 **boolean만** 저장하고
납입 **이력/금액**을 저장하지 않아 "얼마 더 내야 하는지 / 환불이 필요한지"를 계산할 수 없고,
**여러 번에 걸쳐 낸 납입 기록**을 관리자가 볼 수 없다.

## 목표

1. 성도가 본인 가구의 **비-가구주 멤버**를 자유롭게 추가/삭제한다.
2. 객실 타입을 납부 여부와 무관하게 변경할 수 있다.
3. 멤버/타입 변경으로 생긴 **부족분을 자동 계산**해 사용자에게 알리고, **가구주가 PayPal로 부족분(delta)만 추가 납입**할 수 있게 한다.
4. **관리자가 가구별 납입 이력(각 결제 건: 금액·날짜·수단)을 볼 수 있다.**
5. 이미 납부한 가구가 멤버를 빼서 **환불이 필요해지면 관리자가 확인**하고 환불 건을 기록할 수 있다.

## 핵심 시나리오 (김진욱 가구)

1. 김진욱 + 와이프 = 2인실, 2 × $300 = **$600** → PayPal로 6/10 결제. 관리자가 납입 $600(6/10, PayPal) 기록.
2. 3일 뒤 아들·딸 추가 + **4인실로 변경** → 4 × $200 = **$800**. 잔액 = 800 − 600 = **$200**.
3. 성도 카드에 "추가 $200 납부 필요" + $200 PayPal 링크. 김진욱이 6/13 결제.
4. 관리자가 납입 $200(6/13, PayPal) 기록 → **총 납입 $800, 잔액 $0**.
5. 관리자는 원장에서 $600(6/10) + $200(6/13) 두 건을 확인할 수 있다.

## 확정된 결정사항 (brainstorming)

| 항목 | 결정 |
|---|---|
| 타입↔인원 관계 | **수동 + 정원 경고**. 타입은 사용자가 직접 선택, 인원수 > 타입 정원이면 안내만(비차단). 회비는 `타입 단가 × 인원수`. |
| 수정 범위 | **비-가구주 멤버만 추가/삭제**. 가구주(head) 삭제·가구 전체 삭제·가구주 변경은 관리자 전용 유지. |
| 차액 노출 | **인라인 잔액 + 납입 이력**. 관리자가 가구별 잔액 + 개별 납입 건을 보고 결제/환불을 기록. |
| 부족분 납부 | 가구주가 **PayPal로 delta 금액**만 추가 납입 (기존 PayPal 링크 로직 확장). |

## 회비 모델 (원장 기반으로 전환)

- 가구는 객실 타입 하나(`requested_room_type_id`, head 행)를 선택.
- `total = 선택 타입 price_per_person × (6세 이상 인원수)`  ← 현행 유지.
- **신규**: 납입은 개별 건으로 `fee_payments` 원장에 기록 (금액·날짜·수단·메모). 음수 = 환불.
- `paid_total = Σ fee_payments.amount` (해당 가구).
- `balance = total − paid_total`:
  - `balance > 0` → 추가 납부 필요 (가구주 PayPal delta 결제).
  - `balance < 0` → 초과 납입/환불 필요 (관리자가 환불 건을 음수로 기록해 0으로 정산).
  - `balance = 0` → 정산 완료.
- 표시용 `paid`(완납 여부) = `total > 0 && paid_total >= total` (파생값).

> PayPal은 기부 링크(`buildDonateUrl`) 방식이라 **웹훅 자동기록이 아니다**. 성도가 링크로 결제하면
> 관리자가 PayPal에서 입금을 확인하고 **원장에 수동으로 납입 건을 기록**한다. (시나리오와 일치)

## 데이터 모델 변경 — 마이그레이션 `0019_fee_payments.sql`

### 1. `fee_payments` 원장 테이블
```sql
create table public.fee_payments (
  id         uuid primary key default gen_random_uuid(),
  head_id    uuid not null references public.attendees(id) on delete cascade,
  amount     int  not null,            -- USD 정수. 음수 = 환불
  method     text,                     -- 'paypal' | 'cash' | 'check' | 'import' 등 (자유 텍스트)
  note       text,
  paid_at    date not null,            -- 결제/환불 발생일 (관리자 입력)
  created_at timestamptz not null default now()
);
create index fee_payments_head_idx on public.fee_payments(head_id);
alter table public.fee_payments enable row level security;
```
- RLS:
  - 관리자 전체 CRUD (`for all` using/with check `is_admin()`).
  - 성도 SELECT: 본인 가구 원장만 — `head_id in (select public.my_household_head_ids())` (아래 헬퍼).

### 2. 헬퍼 함수
- **`my_household_head_ids() returns setof uuid`** (SECURITY DEFINER, search_path=public):
  현재 세션이 속한 가구의 **가구주 id** 집합. (본인이 head면 id, 아니면 householder_id)
  → fee_payments RLS + 성도 액션(addMyMember의 head 판별)에서 재사용.
- **`household_total(head_id uuid) returns int`** (SECURITY DEFINER): `선택 타입 단가 × (해당 가구 6세 이상 인원수)`. 관리자 납입 폼 기본 금액(=현재 잔액) 계산·my_household_fee에서 재사용.

### 3. guard 트리거 재작성 (`guard_privileged_cols`)
- 기존 `if old.paid then new.requested_room_type_id := old.requested_room_type_id;` **제거** → 납부 후에도 성도가 타입 변경 가능.
- 기존 보호 컬럼(paid, paid_at, retreat_group, is_group_leader, is_householder, householder_id, room_id, language) 유지.

### 4. `remove_my_member(member_id uuid)` RPC (SECURITY DEFINER, grant authenticated)
- `member_id` 행이 **호출자 가구의 비-가구주 멤버**인지 검증(`householder_id in (select my_attendee_ids())` 이고 `is_householder = false`).
- 충족 시 delete, 아니면 0 rows. head/타 가구는 거부.

### 5. `my_household_fee()` RPC (drop & recreate)
- 반환: `total int, type_selected boolean, paid_total int, balance int`.
- `paid_total = coalesce(Σ fee_payments.amount where head_id = 가구주, 0)`, `balance = total − paid_total`.

### 6. 백필
- 기존 `attendees.paid = true` 가구주마다 `fee_payments` 1건 생성:
  `amount = household_total(head), paid_at = coalesce(paid_at::date, now()::date), method = 'import', note = '기존 납부 이관'`.
- 이후 `attendees.paid`/`paid_at`는 **파생값으로 대체**(원장이 진실의 원천). 컬럼은 파괴적 변경 위험을 피해 스키마에 남기되 로직에서 더는 권위를 갖지 않는다. guard 트리거는 계속 보호.

## 서버 액션

### 성도 (`src/app/[locale]/edit/actions.ts`)
- **`addMyMember(input: PersonInput): EditResult`** — `my_household_head_ids()`로 head 확인 → `rowFor(input, {is_householder:false, email:null, householder_id: head})` INSERT. 이름 검증. 관리자 전용 컬럼 미포함.
- **`removeMyMember(memberId): EditResult`** — `remove_my_member` RPC.
- **`updateMyRoomType`** — `if (head.paid) return error` **제거** (타입 변경 항상 허용).

### 관리자 (`src/app/[locale]/admin/actions.ts`)
- **`addPayment(headId, amount, method, paidAt, note): {ok}`** — admin 검증 후 `fee_payments` INSERT. 양수=납입, 음수=환불.
- **`deletePayment(paymentId): {ok}`** — 오기재 수정용 삭제.
- 기존 **`setPaid` 토글은 제거/대체**: 참석자 목록의 납부 토글 → 잔액 표시 + 납입 관리 패널로 교체. (완납 배지는 balance로 파생)

## UI

### Self-edit (`src/components/EditForm.tsx`)
- 멤버 목록 하단 **"가족 추가"** 버튼 → 인라인 빈 `PersonFields` 폼(`addMyMember`, 성공 시 `router.refresh()`).
- 각 **비-가구주** 멤버 카드에 **"삭제"** 버튼 + `confirm` → `removeMyMember`. 가구주 카드엔 없음.
- **정원 경고**: 6세 이상 인원수 > 선택 타입 `capacity`면 타입 select 아래 안내(비차단).

### 회비 카드 (`src/components/HouseholdFeeCard.tsx` + `manage/page.tsx`)
- props: `total`, `paidTotal`, `balance`, `typeSelected`, `payUrl`, (선택) `payments` 이력.
- 분기:
  - `balance > 0` → "추가 납부 $balance 필요" + **balance 금액** PayPal 링크.
  - `balance < 0` → "환불 예정 $|balance| (관리자 처리)".
  - `balance == 0 && total > 0` → "납부 완료" 배지.
  - `total == 0`(타입 미선택) → 타입 선택 안내.
- 납입 이력(선택): 성도도 본인 가구 납입 건(날짜·금액)을 볼 수 있게 간단 목록.
- `manage/page.tsx`: PayPal 링크 조건 `!paid` → **`balance > 0`**, amount = `balance`.

### 관리자 (`src/app/[locale]/admin/attendees` + 대시보드)
- 참석자 목록: 가구별 **잔액** 표시(추가납부 amber / 환불필요 rose / 0 비강조).
- 가구주 행에서 **납입 관리 패널**(모달 또는 인라인): 납입 이력 목록(날짜·금액·수단·메모·삭제) + **"납입 기록"** 폼(금액 기본=현재 잔액, 수단 select, 날짜) + **"환불 기록"**(음수).
- 대시보드 회비 집계: `paid`(파생) 대신 `paid_total`/`balance` 기반으로 갱신.

## `lib/fees.ts`
- `Household`/집계에 `paidTotal`, `balance` 반영. `householdBalance(total, paidTotal)` 헬퍼.
- 대시보드·목록·카드가 공유.

## i18n (ko/en/es)
신규 문구: 가족 추가·삭제·삭제 확인·정원 경고·추가 납부 필요·환불 예정,
(관리자) 잔액·납입 기록·환불 기록·납입 이력·수단(PayPal/현금/수표)·날짜.

## 보안 / RLS 확인
- INSERT는 이미 anon/authenticated 공개 → 멤버 추가는 신규 노출 아님. 서버 액션이 `is_householder=false` + 검증된 `householder_id` 강제.
- DELETE는 관리자 전용 유지. 성도 삭제는 `remove_my_member`(비-가구주+본인 가구)로만.
- `fee_payments`: 관리자만 쓰기, 성도는 본인 가구 읽기만.

## 테스트 / 검증
- 로컬 마이그레이션 적용 후 김진욱 시나리오 재현: $600(6/10) 기록 → 멤버 2명 추가 + 4인실 변경 → 잔액 $200 + 카드 delta 링크 → $200(6/13) 기록 → 잔액 $0, 이력 2건.
- 환불: 완납 가구 멤버 삭제 → 잔액 음수 → 관리자 환불 건(음수) 기록 → 0.
- 미납 가구 멤버 추가/삭제 → total 재계산(원장 무개입).
- head/타 가구 멤버 삭제 시도 → 거부.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## 범위 밖 (YAGNI)
- PayPal 웹훅 자동 납입기록 — 관리자 수동 기록.
- 가구주 자가 변경/가구 병합 — 관리자 전용 유지.
- 삭제된 멤버 감사 로그 — 잔액/원장이 사실상의 신호.
