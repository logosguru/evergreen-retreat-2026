-- =====================================================================
-- 늘푸른교회 하계 수련회 2026 — Phase 1 초기 스키마
-- attendees + admins, RLS, custom access token hook, 트리거
-- =====================================================================

-- ============ enums ============
create type gender_t as enum ('male', 'female');
create type role_t as enum (
  'pastor',   -- 목사
  'elder',    -- 장로
  'gwonsa',   -- 권사
  'deacon',   -- 집사
  'seogyosa', -- 서리집사
  'member',   -- 성도
  'student',  -- 학생
  'child',    -- 유년
  'other'     -- 기타
);
create type attendance_t as enum ('full', 'partial');

-- ============ admins allowlist ============
create table public.admins (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  name       text,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

-- ============ attendees ============
create table public.attendees (
  id              uuid primary key default gen_random_uuid(),
  korean_name     text not null,
  english_name    text,
  district        text,                          -- 소속구역
  gender          gender_t,
  role            role_t default 'member',       -- 직분
  is_householder  boolean not null default false,
  householder_id  uuid references public.attendees(id) on delete set null, -- self-FK
  retreat_group   text,                          -- 수련회조 (관리자 전용)
  is_group_leader boolean not null default false, -- 수련회조장 (관리자 전용)
  note            text,
  email           text,                          -- 본인 수정 scoping 용
  phone           text,
  is_under_6      boolean not null default false, -- 6세 미만(회비 면제·객실 인원 제외)
  -- 출석
  attendance      attendance_t not null default 'full',
  arrival_at      timestamptz,                   -- partial 일 때 필수
  departure_at    timestamptz,                   -- partial 일 때 필수
  -- 회비 (관리자 전용)
  paid            boolean not null default false,
  paid_at         timestamptz,
  -- meta
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint partial_requires_times
    check (attendance = 'full' or (arrival_at is not null and departure_at is not null))
);

create index attendees_householder_idx on public.attendees (householder_id);
create index attendees_email_idx on public.attendees (lower(email));

alter table public.attendees enable row level security;

-- ============ updated_at 자동 갱신 ============
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger trg_attendees_updated
  before update on public.attendees
  for each row execute function public.set_updated_at();

-- ============ is_admin() 헬퍼 (RLS/트리거에서 사용) ============
create or replace function public.is_admin()
returns boolean
language sql stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'app_role', 'member') = 'admin';
$$;

-- ============ 내(현재 세션 이메일) 행 id 목록 ============
-- SECURITY DEFINER 로 RLS 를 우회한다. attendees 정책 안에서 attendees 를
-- 직접 서브쿼리하면 무한 재귀가 나므로, 이 함수로 우회해서 본인/가구 행을 찾는다.
create or replace function public.my_attendee_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.attendees
  where lower(email) = lower(auth.jwt() ->> 'email')
    and auth.jwt() ->> 'email' is not null;
$$;
grant execute on function public.my_attendee_ids to authenticated;

-- ============ 관리자 전용 컬럼 보호 (비관리자 UPDATE 시 OLD 값으로 복원) ============
create or replace function public.guard_privileged_cols()
returns trigger language plpgsql as $$
begin
  if not public.is_admin() then
    new.paid            := old.paid;
    new.paid_at         := old.paid_at;
    new.retreat_group   := old.retreat_group;
    new.is_group_leader := old.is_group_leader;
    new.is_householder  := old.is_householder;
    new.householder_id  := old.householder_id;
  end if;
  return new;
end $$;

create trigger trg_attendees_guard
  before update on public.attendees
  for each row execute function public.guard_privileged_cols();

-- ============ Custom Access Token Hook ============
-- 토큰 발급/갱신 시 사용자 이메일을 admins 에서 조회 → app_metadata.app_role 주입
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims     jsonb := event -> 'claims';
  user_email text  := lower(event -> 'claims' ->> 'email');
  admin_flag boolean;
begin
  select exists(
    select 1 from public.admins a where lower(a.email) = user_email
  ) into admin_flag;

  if admin_flag then
    claims := jsonb_set(claims, '{app_metadata, app_role}', '"admin"');
  else
    claims := jsonb_set(claims, '{app_metadata, app_role}', '"member"');
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end $$;

-- 훅 실행 권한 (auth admin 롤)
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
grant all on table public.admins to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

-- =====================================================================
-- RLS 정책
-- =====================================================================

-- admins: 관리자만 모든 작업
create policy "admins_all_admin" on public.admins
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- access token hook(supabase_auth_admin 역할로 실행)가 admins 를 읽을 수 있도록 허용.
-- 이 정책이 없으면 RLS가 hook의 조회를 막아 모두 'member'로 떨어진다.
create policy "admins_select_auth_admin" on public.admins
  for select to supabase_auth_admin
  using (true);

-- attendees ----------------------------------------------------------

-- 공개 등록 (anon + 로그인 사용자 INSERT 허용) — 유일하게 열린 문
create policy "attendees_insert_public" on public.attendees
  for insert to anon, authenticated
  with check (true);

-- 관리자: 전체 조회
create policy "attendees_select_admin" on public.attendees
  for select to authenticated
  using (public.is_admin());

-- 성도: 본인 이메일 + 그 가구(householder) 행만 조회 (재귀 방지: my_attendee_ids 사용)
create policy "attendees_select_own" on public.attendees
  for select to authenticated
  using (
    id in (select public.my_attendee_ids())
    or householder_id in (select public.my_attendee_ids())
  );

-- 관리자: 전체 수정
create policy "attendees_update_admin" on public.attendees
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 성도: 본인 가구 행만 수정 (관리자 전용 컬럼은 트리거가 보호. 재귀 방지: my_attendee_ids 사용)
create policy "attendees_update_own" on public.attendees
  for update to authenticated
  using (
    id in (select public.my_attendee_ids())
    or householder_id in (select public.my_attendee_ids())
  )
  with check (
    id in (select public.my_attendee_ids())
    or householder_id in (select public.my_attendee_ids())
  );

-- 삭제: 관리자만
create policy "attendees_delete_admin" on public.attendees
  for delete to authenticated
  using (public.is_admin());

-- =====================================================================
-- 첫 관리자 부트스트랩 (마이그레이션은 RLS 우회 권한으로 실행됨)
-- =====================================================================
insert into public.admins (email, name)
values ('joey.kim@bridgerockcap.com', 'Joey Kim')
on conflict (email) do nothing;
