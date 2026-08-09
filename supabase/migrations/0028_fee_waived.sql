-- ============ 회비 면제 (강사 등) ============
-- 초청 강사처럼 회비를 받지 않는 참석자를 관리자가 개별 지정한다.
-- 면제자는 회비 $0이지만 방 인원에는 그대로 집계된다(6세 미만과 다름).
-- 회비 우선순위: 면제 → 6세 미만 → 6~12세 → 부분/전일.
-- TS 쪽 동일 규칙: src/lib/fees.ts personFee().

alter table public.attendees
  add column fee_waived boolean not null default false;

comment on column public.attendees.fee_waived is
  '회비 면제 (관리자 지정, 강사 등). 방 인원에는 집계됨';

-- 관리자 전용 컬럼 보호: fee_waived 추가
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
    new.tshirt_size     := old.tshirt_size;
    new.fee_waived      := old.fee_waived;
  end if;
  return new;
end $$;

-- 가구 회비 합계: 면제자를 인원 집계에서 제외한다(0024 기준 + fee_waived 필터).
create or replace function public.household_total(head_id uuid)
returns int
language sql stable security definer set search_path = public as $$
  with m as (
    select a.is_under_6, a.is_child_6_12, a.attendance
    from public.attendees a
    where (a.id = head_id or a.householder_id = head_id)
      and not a.fee_waived
  ),
  price as (
    select coalesce(
      (select rt.price_per_person from public.room_types rt
        where rt.id = (select requested_room_type_id from public.attendees where id = head_id)),
      0) as per_person
  )
  select case
    when public.is_admin()
      or head_id in (select public.my_household_head_ids())
    then (
      -- 성인 전참 × 선택 객실 타입 단가 (타입 미선택이면 0 = 미산정)
      (select per_person from price)
        * (select count(*) from m
            where not is_under_6 and not is_child_6_12 and attendance = 'full')
      -- 성인 부분 참석 × $100
      + 100 * (select count(*) from m
                where not is_under_6 and not is_child_6_12 and attendance = 'partial')
      -- 6~12세 전일 × $100
      + 100 * (select count(*) from m
                where not is_under_6 and is_child_6_12 and attendance = 'full')
      -- 6~12세 부분 × $50
      + 50 * (select count(*) from m
                where not is_under_6 and is_child_6_12 and attendance = 'partial')
    )
    else 0
  end::int;
$$;
grant execute on function public.household_total to authenticated;

-- 회비 확정 여부: 객실 타입 단가가 필요한 사람(면제 아닌 성인 전참)이 있을 때만 타입 선택이 필수.
-- 강사만 있는 가구는 타입 미선택이어도 회비가 확정($0)된 상태다.
drop function if exists public.my_household_fee();
create function public.my_household_fee()
returns table (total int, fee_determined boolean, paid_total int, balance int)
language sql stable security definer set search_path = public as $$
  with h as (
    select id, requested_room_type_id
    from public.attendees
    where id in (select public.my_household_head_ids())
    limit 1
  ),
  c as (
    select
      public.household_total((select id from h)) as total,
      (
        (select requested_room_type_id from h) is not null
        or not exists (
          select 1 from public.attendees a
          where (a.id = (select id from h) or a.householder_id = (select id from h))
            and not a.fee_waived
            and not a.is_under_6
            and not a.is_child_6_12
            and a.attendance = 'full'
        )
      ) as fee_determined,
      coalesce((select sum(amount)::int from public.fee_payments
                where head_id = (select id from h)), 0) as paid_total
  )
  select total, fee_determined, paid_total, (total - paid_total)::int as balance from c;
$$;
grant execute on function public.my_household_fee to authenticated;
