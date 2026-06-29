# Phase 2 — 방 배치 + 회비 계산 설계

## Context (배경)

Evergreen Church 수련회 2026 web app의 Phase 2. Phase 1(등록·인증·참석자 관리·i18n)은
완료·검증됨. 수련회 회비는 **배정된 객실 인원에 따라** 결정된다(안내문 기준):

- 2인실 $300/인, 3인실 $250/인, 4인실 $200/인 (2박3일 숙박+식사 포함)
- **6세 미만은 회비 면제 + 객실 정원 집계 제외** (Phase 1에서 `attendees.is_under_6` 추가됨)
- 가정당 1부 제출 (Phase 1의 가구주 일괄 등록으로 충족)

Phase 2는 관리자가 객실을 정의하고 참석자를 호실에 배치하며, 그 배치로부터 **회비를 자동
계산**하고, 성도는 본인 가구의 회비/납부만 조회한다.

## 확정된 결정사항

| 항목 | 결정 |
|---|---|
| 객실 모델 | `room_types {이름, 정원, 1인단가}` + `rooms {호실, 타입}` 인스턴스 |
| 배치 단위 | 참석자별 `attendees.room_id` (개별 호실에 배치) |
| 회비 금액 | **사람별 계산**(저장 안 함): 6세미만=$0, 미배정=미산정, 그 외=방 타입 1인단가 |
| 납부 | **가구 단위** — 가구주(head) 행의 `paid`/`paid_at` 재활용 (별도 households 테이블 없음) |
| 성도 공개 | **회비 금액·납부만** 읽기전용 (방 배치는 관리자 전용·비공개) |
| 정원 초과 | 소프트 경고 (차단 안 함) |
| 6세 미만 | 방 배정은 하되 정원 카운트·회비 제외 |

## 데이터 모델 — `supabase/migrations/0002_rooms.sql`

```sql
-- 객실 타입 (관리자 정의)
create table public.room_types (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,            -- 예: "4인실" / "Quad"
  capacity         int  not null check (capacity > 0),
  price_per_person int  not null check (price_per_person >= 0),  -- USD 정수
  sort_order       int  not null default 0,
  created_at       timestamptz not null default now()
);

-- 실제 호실 인스턴스
create table public.rooms (
  id            uuid primary key default gen_random_uuid(),
  label         text not null,               -- 예: "201호", "Cabin A"
  room_type_id  uuid not null references public.room_types(id) on delete restrict,
  note          text,
  sort_order    int  not null default 0,
  created_at    timestamptz not null default now()
);

-- 참석자 → 호실 배치 (관리자 전용 컬럼)
alter table public.attendees
  add column room_id uuid references public.rooms(id) on delete set null;
create index attendees_room_idx on public.attendees(room_id);
```

**시드** (마이그레이션 끝에): room_types 3종.
```sql
insert into public.room_types (name, capacity, price_per_person, sort_order) values
  ('2인실', 2, 300, 1),
  ('3인실', 3, 250, 2),
  ('4인실', 4, 200, 3);
```

### 트리거 변경
`guard_privileged_cols`에 `room_id`를 추가 — 비관리자 UPDATE 시 `new.room_id := old.room_id`로
복원 (성도 자가배정 차단).

## 회비 계산 로직

저장하지 않고 계산한다(단가/배정 변경 시 자동 반영).

- **사람별 회비**: `is_under_6 → 0` · `room_id is null → null(미산정)` · 그 외 →
  배정된 room 의 room_type.price_per_person
- **가구별 합계**: 가구(head + members) 구성원의 사람별 회비 합 (null=미산정은 0으로 합산하되
  "미배정 N명" 별도 표시)
- **납부**: 가구주(head, `is_householder=true`) 행의 `paid`/`paid_at`. 관리자가 가구 단위 토글.

### 성도용 RPC — `my_household_fee()`
방 테이블을 성도에게 노출하지 않고 금액만 주기 위해 `SECURITY DEFINER` 함수로 제공.

```sql
create or replace function public.my_household_fee()
returns table (total int, unassigned_count int, paid boolean)
language sql stable security definer set search_path = public as $$
  with mine as (
    -- 내 가구의 모든 행 (Phase 1 my_attendee_ids 활용: 본인 head + 가구원)
    select a.* from public.attendees a
    where a.id in (select public.my_attendee_ids())
       or a.householder_id in (select public.my_attendee_ids())
  )
  select
    coalesce(sum(case when m.is_under_6 then 0
                      when m.room_id is null then 0
                      else rt.price_per_person end), 0)::int as total,
    count(*) filter (where not m.is_under_6 and m.room_id is null)::int as unassigned_count,
    bool_or(m.is_householder and m.paid) as paid
  from mine m
  left join public.rooms r on m.room_id = r.id
  left join public.room_types rt on r.room_type_id = rt.id;
$$;
grant execute on function public.my_household_fee to authenticated;
```

## RLS

```sql
alter table public.room_types enable row level security;
alter table public.rooms enable row level security;

-- 방 테이블: 관리자만 (조회·수정 모두) — 방 배치 비공개
create policy "room_types_admin" on public.room_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "rooms_admin" on public.rooms
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
```
- `attendees.room_id`: 별도 정책 불필요(기존 attendees UPDATE 정책 사용) + `guard_privileged_cols`로 보호.
- 성도는 `my_household_fee()` RPC로만 금액 접근.

## UI

### 관리자
- **`/admin/rooms`** (관리자 전용 그룹): 객실 타입 관리(이름/정원/단가 CRUD) + 호실 관리(호실명/타입 CRUD).
  서버 액션: `upsertRoomType`, `deleteRoomType`, `upsertRoom`, `deleteRoom`.
- **`/admin/assignments`**: 방 배치 화면.
  - 호실별 카드: 입실자 목록, **정원 대비 인원(6세 미만 제외)**, 정원 초과 시 경고 배지.
  - 미배정자 목록(가구별 그룹).
  - 각 참석자 행의 호실 드롭다운으로 배정 (서버 액션 `assignRoom(attendeeId, roomId|null)`).
  - "방 배치 현황표" = 이 카드 뷰가 곧 현황표.
- **참석자 표(`/admin`) 보강**: 방(호실) 컬럼 + 계산된 사람별 회비. 납부 토글은 **가구 단위**
  (가구주 행에 표시, 가구 합계 노출). 상단 합계: 총 예상 회비 / 납부 가구 수.

### 성도 (`/edit/manage`)
- 상단에 **회비 카드**: 가구 합계 금액 + 납부 여부(읽기전용) + 미배정 인원 안내.
  `supabase.rpc('my_household_fee')` 호출.

### i18n
`messages/{ko,en}.json`에 `Rooms`, `Fee` 네임스페이스 추가. 객실 타입/호실 이름은 관리자
입력 데이터(번역 대상 아님).

## 컴포넌트/파일 (신규·수정)

신규:
- `supabase/migrations/0002_rooms.sql`
- `src/app/[locale]/admin/(protected)/rooms/page.tsx` + `RoomManager` 컴포넌트
- `src/app/[locale]/admin/(protected)/assignments/page.tsx` + `AssignmentBoard` 컴포넌트
- `src/app/[locale]/admin/rooms-actions.ts` (room/room_type CRUD), `assignment-actions.ts` (assignRoom)
- `src/lib/fees.ts` — 회비 계산 헬퍼(사람별/가구별), 공용 타입
- `src/components/HouseholdFeeCard.tsx` (성도용)

수정:
- `src/lib/types.ts` — `RoomType`, `Room` 타입, `Attendee.room_id`
- `src/app/[locale]/admin/(protected)/page.tsx` + `AdminAttendeeTable` — 방 컬럼·회비·가구 납부 토글
- `src/app/[locale]/admin/actions.ts` — `setPaid`를 가구(head) 단위로 동작하도록
- `src/app/[locale]/edit/manage/page.tsx` + `EditForm` — 회비 카드 추가
- `src/components/SiteHeader` 또는 admin 내비 — `/admin/rooms`, `/admin/assignments` 링크

## 검증 (Verification)

- **마이그레이션**: `supabase db reset` → room_types 3종 시드 확인, attendees.room_id 존재.
- **객실 관리**: 관리자가 타입/호실 생성·수정·삭제. 비관리자/anon은 room_types·rooms 조회 불가(RLS).
- **배치 + 회비**: 호실 배정 → 관리자 표에 사람별 회비 = 방 타입 단가, 6세미만=$0, 미배정=미산정.
  가구 합계 정확. 정원 초과 시 경고.
- **납부(가구)**: 관리자가 가구 토글 → 가구주 행 paid 갱신. 성도 화면 회비 카드에 합계·납부 반영.
- **성도 격리**: `my_household_fee()`가 본인 가구 금액만 반환(타가구 금액 노출 안 됨).
  성도가 `room_id`/`rooms`/`room_types` 직접 접근 시 차단(트리거·RLS).
- **agent-browser 스모크**: Phase 1 데이터로 호실 생성→배정→관리자 회비 확인→성도 회비 카드 확인.

## 비고 / 범위 밖 (후속)
- 전체 대시보드 집계(점유율·미납 목록 등 심화)는 Phase 4.
- 객실 타입 이름 이중언어, 드래그앤드롭 배치, 자동 방 추천은 범위 밖(필요 시 후속).
