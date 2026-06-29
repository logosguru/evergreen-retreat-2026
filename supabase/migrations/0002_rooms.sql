-- ============ Phase 2: 객실 + 회비 ============

create table public.room_types (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,                                   -- 예: "4인실"
  capacity         int  not null check (capacity > 0),
  price_per_person int  not null check (price_per_person >= 0),     -- USD 정수
  sort_order       int  not null default 0,
  created_at       timestamptz not null default now()
);

create table public.rooms (
  id           uuid primary key default gen_random_uuid(),
  label        text not null,                                       -- 예: "201호"
  room_type_id uuid not null references public.room_types(id) on delete restrict,
  note         text,
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now()
);

alter table public.attendees
  add column room_id uuid references public.rooms(id) on delete set null;
create index attendees_room_idx on public.attendees(room_id);

-- 관리자 전용 컬럼 보호: room_id 추가
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
    new.room_id         := old.room_id;
  end if;
  return new;
end $$;

-- RLS: 방 테이블 관리자 전용
alter table public.room_types enable row level security;
alter table public.rooms enable row level security;
create policy "room_types_admin" on public.room_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "rooms_admin" on public.rooms
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 성도용: 본인 가구 회비 합계/납부 (방 테이블 비노출, SECURITY DEFINER)
create or replace function public.my_household_fee()
returns table (total int, unassigned_count int, paid boolean)
language sql stable security definer set search_path = public as $$
  with mine as (
    select a.* from public.attendees a
    where a.id in (select public.my_attendee_ids())
       or a.householder_id in (select public.my_attendee_ids())
  )
  select
    coalesce(sum(case when m.is_under_6 then 0
                      when m.room_id is null then 0
                      else rt.price_per_person end), 0)::int as total,
    count(*) filter (where not m.is_under_6 and m.room_id is null)::int as unassigned_count,
    coalesce(bool_or(m.is_householder and m.paid), false) as paid
  from mine m
  left join public.rooms r on m.room_id = r.id
  left join public.room_types rt on r.room_type_id = rt.id;
$$;
grant execute on function public.my_household_fee to authenticated;

-- 시드: 표준 객실 타입 3종
insert into public.room_types (name, capacity, price_per_person, sort_order) values
  ('2인실', 2, 300, 1),
  ('3인실', 3, 250, 2),
  ('4인실', 4, 200, 3);
