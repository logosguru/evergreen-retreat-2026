-- ============ 6~12세 아동 정액 회비 ============
-- 6~12세는 방 종류와 무관하게 정액: 부분 참석 $50 / 전일 참석 $100.
-- 6세 미만 면제가 우선. 아동도 객실 인원에는 집계됨(6세 미만만 제외).
-- TS 쪽 동일 규칙: src/lib/fees.ts personFee() / CHILD_PARTIAL_FEE / CHILD_FULL_FEE.

alter table public.attendees
  add column is_child_6_12 boolean not null default false;

comment on column public.attendees.is_child_6_12 is
  '6~12세 (회비 정액: 부분 $50 / 전일 $100). is_under_6와 동시 참이면 안 됨';

-- 두 연령 플래그는 상호 배타 (6세 미만이면 6~12세일 수 없음)
alter table public.attendees
  add constraint attendees_age_flags_exclusive
  check (not (is_under_6 and is_child_6_12));

create or replace function public.household_total(head_id uuid)
returns int
language sql stable security definer set search_path = public as $$
  with m as (
    select a.is_under_6, a.is_child_6_12, a.attendance
    from public.attendees a
    where a.id = head_id or a.householder_id = head_id
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

-- 회비 확정 여부: 객실 타입 단가가 필요한 사람(성인 전참)이 있을 때만 타입 선택이 필수.
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
