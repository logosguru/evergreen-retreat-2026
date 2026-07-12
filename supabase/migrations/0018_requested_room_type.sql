-- 성도가 선택한 객실 타입(가구 단위, 가구주 행에 저장) → 회비 산정 소스.
alter table public.attendees
  add column requested_room_type_id uuid
    references public.room_types(id) on delete set null;
create index attendees_requested_room_type_idx
  on public.attendees(requested_room_type_id);

-- room_types 공개 읽기(가격은 공개 정보; 선택 UI가 타입 목록을 불러오려면 필요).
-- rooms(물리적 호실)은 계속 관리자 전용.
create policy "room_types_public_read" on public.room_types
  for select to anon, authenticated using (true);

-- 회비 RPC: 물리적 배정(room_id) → 가구주 선택(requested_room_type_id) 기반으로 재작성.
-- 반환 컬럼(OUT 파라미터) 자체가 바뀌므로 create or replace 불가 → drop 후 재생성.
drop function if exists public.my_household_fee();
create function public.my_household_fee()
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
  )
  select
    (coalesce(
      (select price_per_person from public.room_types
        where id = (select requested_room_type_id from head)), 0)
     * (select count(*) from mine m where not m.is_under_6))::int as total,
    (select requested_room_type_id from head) is not null as type_selected,
    coalesce((select paid from head), false) as paid;
$$;
grant execute on function public.my_household_fee to authenticated;

-- 납부 완료 후에는 성도가 객실 타입을 못 바꾸도록 DB 레벨에서도 고정(앱 방어 + 방어심화).
-- 미납 상태에선 성도 수정 허용(requested_room_type_id는 관리자 전용 아님).
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
    new.language        := old.language;
    if old.paid then
      new.requested_room_type_id := old.requested_room_type_id;
    end if;
  end if;
  return new;
end $$;
