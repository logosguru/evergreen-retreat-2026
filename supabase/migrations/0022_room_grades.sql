-- =====================================================================
-- 객실 등급 (관리자 전용): Premium(무제한) / Luxury(double+single 합산 10) / Junior suite(2)
-- - bed_type = 침대 "개수" (single=1개, double=2개). 침대 크기 아님.
-- - 등급은 고정 3행 시드, CRUD 없음. 쿼터 숫자만 관리자가 수정.
-- - room_types(2/3/4인실)는 성도 대면 회비 타입으로 그대로 유지 — 여기와 무관.
-- =====================================================================
create type public.bed_type_t as enum ('single', 'double');

create table public.room_grades (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,       -- 토큰: premium/luxury/junior_suite (라벨은 i18n)
  quota      int check (quota >= 0),     -- null = 무제한
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.room_grades (name, quota, sort_order) values
  ('premium', null, 1),
  ('luxury', 10, 2),
  ('junior_suite', 2, 3);

alter table public.rooms
  add column grade_id uuid references public.room_grades(id) on delete restrict,
  add column bed_type public.bed_type_t not null default 'double';

-- 기존 호실 backfill: 전부 Premium (관리자가 이후 화면에서 수정)
update public.rooms
  set grade_id = (select id from public.room_grades where name = 'premium');
alter table public.rooms alter column grade_id set not null;

-- RLS: rooms와 동일 — 관리자 전용, anon 정책 없음 (성도 완전 비노출)
alter table public.room_grades enable row level security;
create policy "room_grades_admin" on public.room_grades
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
