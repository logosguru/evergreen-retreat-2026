# 성도 객실 타입 선택 + 선택 기반 회비 + PayPal 결제

- 날짜: 2026-07-11
- 상태: 설계 확정 대기 (사용자 리뷰)
- 관련: PayPal 인라인 결제 링크(`2026-07-11-paypal-fee-payment-design.md`, 이미 배포됨)를 재사용/확장

## 배경 / 문제

PayPal 결제 링크는 배포됐으나 프로덕션에서 버튼이 안 보임. 원인: 회비가 관리자의
**물리적 방 배정(`attendees.room_id`)**에서 계산되는데, 아직 호실 생성·배정이 전혀
없어(rooms=0) 모든 가구의 `total=0`·`미배정>0` → 설계상 버튼이 숨겨짐.

해결 방향(사용자 결정): 성도가 **등록·수정 시 원하는 객실 타입을 직접 선택**하고,
그 선택에서 **회비를 산정**해 PayPal로 낼 수 있게 한다. 관리자의 물리적 방 배정은
**로지스틱스(누가 어느 호실에)**로 분리해 유지한다.

## 확정된 결정사항

| 항목 | 결정 |
|---|---|
| 선택 단위 | **가구 단위** — 가구주 행에 저장, 6세 이상 가족 전체에 적용 |
| 회비 소스 | **성도가 고른 객실 타입**(단일 소스). 관리자 `room_id` 배정은 회비와 분리(로지스틱스만) |
| 필수 여부 | **선택 사항**(미선택 허용). 기존 97명은 null → /edit에서 선택 |
| 관리자 회비 뷰 | 대시보드·참석자표·방배치 현황 모두 **선택 기준**으로 전환(성도/관리자 금액 일치) |
| 결제 방식 | 기존 PayPal 인라인 링크 재사용. amount만 선택 기반으로 |
| 납부 후 변경 | paid=true면 타입 선택 **잠금(읽기전용)** — 납부액과 불일치 방지 |
| 재고/정원 제한 | **없음**(YAGNI) — 선택은 희망 신청, 실제 호실 인벤토리는 관리자 배정에서 관리 |

## 비목표 (YAGNI)

- 실시간 객실 재고/정원 제한, 타입별 잔여 수량 표시
- 결제 자동 대조/웹훅/Orders API (기존대로 관리자 수동 `paid`)
- 물리적 방 배정 UI 변경(정원 경고·배정 보드는 그대로)
- 개인별(가구원마다 다른) 타입 선택

## 데이터 모델

### 신규 컬럼

```sql
alter table public.attendees
  add column requested_room_type_id uuid
    references public.room_types(id) on delete set null;
```

- **가구주(head) 행에만 저장**하는 것을 의미상 규칙으로 함(가구원 행은 null 유지).
  회비 계산·표시 모두 head의 값을 가구 전체에 적용한다.
- **성도 수정 가능**: `guard_privileged_cols` 트리거가 복원하는 관리자 전용 컬럼
  목록에 **포함하지 않는다**(성도가 RLS update_own로 변경 가능해야 함).

### room_types 공개 읽기

현재 `room_types_admin`(관리자 전용) RLS만 있어 성도가 타입 목록을 못 읽는다.
공개 읽기 정책 추가(가격은 공개 정보):

```sql
create policy "room_types_public_read" on public.room_types
  for select to anon, authenticated using (true);
```

(`rooms` 테이블은 계속 관리자 전용 — 물리적 호실은 비노출.)

## 회비 산정 (선택 기반)

### 규칙

- 1인 회비 = `is_under_6` → $0; 아니면 head의 `requested_room_type_id`가 가리키는
  타입의 `price_per_person`; head가 미선택이면 **미산정(null)**.
- 가구 회비 합계 = (타입 선택 시) `price_per_person × (6세 미만 아닌 가구원 수)`;
  미선택 시 0 + "미선택" 상태.
- 납부는 기존대로 가구주(head) 행의 `paid`를 가구 단위로 사용.

### `my_household_fee()` RPC 재작성

기존 반환 `(total int, unassigned_count int, paid boolean)` →
**`(total int, type_selected boolean, paid boolean)`** 로 변경.

```sql
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
  ),
  rt as (
    select price_per_person from public.room_types
    where id = (select requested_room_type_id from head)
  )
  select
    coalesce((select price_per_person from rt), 0)
      * (select count(*) from mine m where not m.is_under_6)::int as total,
    (select requested_room_type_id from head) is not null as type_selected,
    coalesce((select paid from head), false) as paid;
$$;
```

(호출부 `/edit/manage`는 `unassigned_count` → `type_selected`로 소비 변경.)

### `lib/fees.ts` + 관리자 소비처 전환

- 회비 계산의 소스를 `rooms.room_types`(배정) → head의
  `requested_room_type`(선택)로 변경.
- 영향: `lib/fees.ts`(`personFee`/`groupHouseholds`/`AttendeeWithRoom` 등),
  `lib/dashboard.ts`(총 예상 회비·납부), 관리자 참석자표(회비 열),
  방배치 현황(`/admin/assignments`의 회비 표시).
- 관리자 쿼리는 `attendees` 조회 시 head의 `requested_room_type_id`로
  `room_types(name, price_per_person)`를 조인해 가구별로 적용.
- "미배정(unassigned)" 개념 표기는 회비 맥락에서 **"미선택"**으로 바뀐다.
  (물리적 방배치 보드의 "미배정"은 room_id 기준으로 그대로 유지.)

> **주의(경계)**: `/admin/assignments`의 **물리적 방 배정·정원 초과 경고**는
> `room_id` 기준 그대로. 이 페이지에서 **회비 금액 표시**만 선택 기준으로 바뀐다.

## UI

### 등록 폼 (`/register`)

- 가구 단위 **객실 타입 선택**(select). 옵션은 DB `room_types`에서 로드,
  라벨 = `"{name} · {price}/인"`(i18n 포맷). **선택 사항**(빈 값 허용).
- 위치: 등록 방식/가구주 섹션 근처(가구 전체 1개). individual 모드에서도 1개.
- register 페이지(서버)가 `room_types`를 조회해 폼(client)에 props로 전달.
- `RegistrationPayload`에 `roomTypeId?: string` 추가 → insert 시 head 행의
  `requested_room_type_id`로 저장(가구원 행은 null).

### 수정 화면 (`/edit/manage`)

- 같은 select. 현재 head의 선택값을 초기값으로.
- **paid=true면 읽기전용**(선택 잠금) + "납부 완료" 표시.
- 저장: 전용 서버 액션 `updateMyRoomType(roomTypeId | null)` — RLS로 본인 가구
  head 행을 찾아 `requested_room_type_id` 갱신(빈 선택 → null).
- manage 페이지(서버)가 `room_types` 목록 + 현재 선택값을 로드해 전달.

### 회비 카드 + PayPal (기존 재사용)

- `type_selected && !paid && total>0 && 이메일설정됨` → "PayPal로 $X 납부하기".
- `!type_selected` → 버튼 대신 "방 타입을 선택하면 회비가 산정됩니다" 안내
  (선택 UI로 유도).
- `buildDonateUrl` 그대로. `amount = total`(선택 기반), `item_number`= 가구주+구역.
- **`HouseholdFeeCard` prop 변경**: 기존 `unassignedCount: number`(미배정 안내용)를
  제거하고 `typeSelected: boolean`으로 교체. `!typeSelected`일 때 미선택 안내를
  렌더(기존 `unassignedNotice` 자리). `payUrl`/`paid`/`total`은 유지.
  호출부(`/edit/manage`)도 이에 맞춰 전달값 변경.

### 관리자 편집 폼

- `AdminEditForm`(참석자 편집)에 객실 타입 선택 추가(97명 정정·대리 선택).
- 서버 액션 `adminUpdateAttendee` 화이트리스트에 `requested_room_type_id` 추가.
  (관리자는 head가 아닌 행에도 이론상 설정 가능하나, 회비 계산은 head 값만 사용.)

## 에러 처리 / 엣지 케이스

- head 미선택 → total 0, `type_selected=false` → 버튼 숨김 + 안내.
- 전원 6세 미만인데 타입 선택 → 6세이상 수 0 → total 0 → 버튼 숨김(정상).
- paid=true 상태에서 선택 변경 시도 → UI에서 잠금(읽기전용). (서버 액션도
  paid면 거부하는 방어 코드 포함.)
- 타입이 나중에 삭제됨(`on delete set null`) → 선택 해제되어 미선택 취급.
- 기존 97명: 모두 null → /edit 또는 관리자 편집에서 선택 시 즉시 회비 산정.

## 테스트

- **단위**: `lib/fees.ts` 선택 기반 계산(가구 합계 = 단가×6세이상 수, 미선택=0,
  6세미만 제외), `lib/dashboard.ts` 집계 — 프로젝트에 프레임워크 없으므로
  `npx tsx` 어서션 + `tsc`/`lint`.
- **DB**: `my_household_fee()` psql 검증(선택/미선택/6세미만/paid 시나리오).
- **브라우저(E2E)**: 등록 시 타입 선택→저장; /edit/manage에서 선택 변경→회비 카드
  금액·PayPal href 갱신 확인; paid 시 잠금; 미선택 시 안내; 관리자 대시보드/참석자표
  금액이 선택 기준으로 일치.

## 영향 범위

- **신규 마이그레이션** `0018_requested_room_type.sql`(컬럼 + room_types 공개읽기 +
  my_household_fee 재작성). ⚠️ 프로덕션 적용은 **사용자가 직접 `supabase db push`**
  (코드 병합보다 먼저).
- 신규: `updateMyRoomType` 서버 액션, 객실 타입 select 컴포넌트(공용).
- 수정: `lib/fees.ts`, `lib/dashboard.ts`, `lib/types.ts`(RoomType 노출/타입),
  `register/{page,actions,폼}`, `edit/manage/page` + `EditForm`,
  `HouseholdFeeCard`(`unassignedCount`→`typeSelected` prop 교체 + 미선택 안내 분기),
  `admin` 참석자표·대시보드·assignments 회비표시,
  `AdminEditForm` + `adminUpdateAttendee`, `messages/{ko,en,es}.json`.
- 환경변수: 추가 없음(PayPal env는 이미 설정됨).

## 오픈 이슈 (구현 중 확정 가능)

- 라벨 포맷 정확한 문구(예: "2인실 · $300/인" vs "2인실 ($300/인)") — i18n에서 확정.
- register 폼 내 선택 위치(가구주 섹션 상단 권장).
