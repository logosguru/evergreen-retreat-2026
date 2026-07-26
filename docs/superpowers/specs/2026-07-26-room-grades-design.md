# 객실 등급(Grade) 세분화 — 설계

날짜: 2026-07-26
상태: 승인됨 (구현 전)

## 배경 / 목표

Honor's Haven 리조트의 실제 객실은 등급이 나뉜다:

- **Premium** double / single — 나머지 전부 (수량 제한 없음)
- **Luxury** double / single — **합산 10개** (리조트에서 선배정)
- **Junior suite** double — **2개** (리조트에서 선배정)

관리자가 방을 만들고 배치할 때는 이 등급을 구분해야 하고, 등급별 보유 수량(쿼터)이
저장되어 배치 시 참고할 수 있어야 한다. 반면 **공개 등록/본인수정/회비 화면은 지금처럼
2/3/4인실(회비 타입)만 노출**한다 — 성도에게 등급 정보가 보일 경로가 없어야 한다.

핵심 분리: `room_types`(2/3/4인실)는 **성도 대면 회비 타입**, `room_grades`는
**관리자 전용 물리 객실 등급**. 물리 호실(`rooms`)은 등급 + 침대타입 + 정원타입(2/3/4인실)을
각각 가진다 (예: Luxury·Double 방에 4인 가족을 받으면 정원타입을 4인실로 지정).

## 확정 결정사항

| 항목 | 결정 |
|---|---|
| 정원 기준 | 등급과 무관하게 방마다 기존 2/3/4인실 타입으로 별도 지정 (정원 초과 경고 로직 무변경) |
| 수량 관리 | 등급별 쿼터 숫자를 DB에 저장 (호실 선생성 아님). 쿼터 대비 사용량 표시 + 초과 경고 |
| 쿼터 값 | Premium 무제한(null) / Luxury 10 (double+single 합산) / Junior suite 2 |
| 쿼터 집계 단위 | 해당 등급 **호실 개수** (배정 인원 아님 — 리조트가 방 단위로 잡아준 수량) |
| 쿼터 초과 시 | 경고 배지만, 호실 생성 차단 없음 (협의 중 변동 가능) |
| 등급 목록 | 고정 3종 시드, 등급 CRUD 없음. **쿼터 숫자만 관리자 수정 가능** |
| 배치 화면 | 호실 카드를 등급별 섹션으로 그룹, 섹션 헤더에 쿼터 현황 |
| 기존 호실 backfill | 전부 Premium / bed_type 기본 double |
| 공개 화면 | 변경 없음 (2/3/4인실만 노출) |

## 1. 데이터 모델 — `supabase/migrations/0022_room_grades.sql`

```sql
create type public.bed_type as enum ('single', 'double');

create table public.room_grades (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,   -- 토큰: 'premium' | 'luxury' | 'junior_suite' (라벨은 i18n)
  quota      int check (quota >= 0), -- null = 무제한
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.room_grades (name, quota, sort_order) values
  ('premium', null, 1), ('luxury', 10, 2), ('junior_suite', 2, 3);

alter table public.rooms
  add column grade_id uuid references public.room_grades(id) on delete restrict,
  add column bed_type public.bed_type not null default 'double';
update public.rooms
  set grade_id = (select id from public.room_grades where name = 'premium');
alter table public.rooms alter column grade_id set not null;

-- RLS: rooms와 동일 패턴 — 관리자 전용, anon 정책 없음 (성도 완전 비노출)
alter table public.room_grades enable row level security;
create policy "room_grades_admin" on public.room_grades
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
```

- `rooms.room_type_id`(2/3/4인실)는 유지 → 회비 산정(`requested_room_type_id` 기반),
  대시보드 정원 집계, 참석자 목록 정렬·표시 로직 전부 무변경.
- DB 컨벤션 준수: 영문 토큰 저장, 화면 라벨은 `messages/{ko,en}.json`.

## 2. 타입/순수 로직

- `src/lib/types.ts`: `BED_TYPES = ['single','double']`, `BedType`, `RoomGrade` 인터페이스,
  `Room`에 `grade_id: string`, `bed_type: BedType` 추가.
- `src/lib/rooms.ts` (신규): `gradeUsage(grades, rooms)` → 등급별
  `{ used, quota, over }` (호실 개수 기준, quota null이면 over 없음). 순수 함수.

## 3. `/admin/rooms` — RoomManager

- 최상단 **"객실 등급" 섹션**: 등급 3행 — 라벨 · 쿼터 입력(빈값=무제한) ·
  `사용 n / 쿼터` 배지(초과 시 rose 강조). 저장 → `updateGradeQuota()`.
- 호실 생성 폼: 호실명 + **등급 select + 침대 select(기본 Double)** + 정원타입(2/3/4인실) select.
- 호실 목록: 등급 sort_order → 호실 sort_order 순 그룹 정렬,
  행 표시 `201호 · Premium · Double · 4인실`. 기존 행에서 등급/침대 인라인 수정 가능.
- 기존 "객실 타입" 섹션 제목을 "회비 타입(성도 화면용)" 뉘앙스로 라벨만 명확화 (혼동 방지).

## 4. `/admin/assignments` — AssignmentBoard

- 서버 페이지에서 `room_grades` 추가 조회, rooms 조인에 grade 포함.
- 호실 카드를 **등급별 섹션 그룹** (Premium → Luxury → Junior suite).
  섹션 헤더: 등급 라벨 + `호실 n개 / 쿼터 10` (무제한이면 개수만).
- 카드 제목: `301호 · Luxury·Double·3인실`. 배정 드롭다운 옵션: `301호 (Luxury·3인실)`.
- 정원 초과 경고(2/3/4 정원 기준) 로직 무변경.

## 5. 서버 액션 — `rooms-actions.ts`

- `upsertRoom()`: `grade_id`, `bed_type` 필드 추가 (필수).
- `updateGradeQuota(id: string, quota: number | null)` 신설.
  권한은 room_grades 관리자 RLS가 보호 (기존 패턴과 동일).

## 6. i18n — `messages/{ko,en}.json` `Rooms` 네임스페이스

`grades`(섹션 제목), `grade.premium/luxury/juniorSuite`, `bed.single/bed.double`,
`quota`, `unlimited`, `gradeUsage`(사용 n/쿼터), `quotaOver` 등.
es UI 번역은 기존 방침대로 후속 (관리자 화면은 ko/en만).

## 7. 공개 화면 — 변경 없음

등록 폼·본인 수정·회비 카드는 `room_types`만 사용. `room_grades`·`rooms`는
anon SELECT 정책이 없어 성도에게 노출 경로 없음.

## 8. 에러 처리 / 엣지 케이스

- 쿼터 초과: 표시만 (rose 배지 `사용 12 / 쿼터 10 · 초과`), 저장 차단 없음.
- 쿼터 입력 빈값 → null(무제한)로 저장. 음수는 DB check + 클라이언트 min=0으로 차단.
- 등급 삭제 없음 → `rooms.grade_id` restrict FK로도 방어.
- 기존 프로덕션 호실 데이터: 마이그레이션이 Premium/double로 backfill (관리자가 이후 화면에서 수정).

## 9. 검증

- `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- 로컬 `supabase start`(0022 적용) + `npm run dev` 실제 구동:
  /admin/rooms 등급 쿼터 수정·호실 생성, /admin/assignments 등급 섹션·배정,
  공개 /register 에 등급 미노출 확인. (빌드 통과 ≠ 런타임 정상 — 프로젝트 교훈)
