-- ============ 부분 참석 정액 회비 ============
-- 부분 참석(주일만 참석)은 숙박이 없으므로 객실 타입 단가와 무관하게 1인 $100 정액.
-- 6세 미만 면제는 그대로 우선(부분 참석이어도 $0).
-- TS 쪽 동일 규칙: src/lib/fees.ts personFee() / PARTIAL_FEE.

create or replace function public.household_total(head_id uuid)
returns int
language sql stable security definer set search_path = public as $$
  select case
    when public.is_admin()
      or head_id in (select public.my_household_head_ids())
    then (
      -- 전참 인원 × 선택 객실 타입 단가 (타입 미선택이면 0 = 미산정)
      coalesce(
        (select rt.price_per_person from public.room_types rt
          where rt.id = (select requested_room_type_id from public.attendees where id = head_id)),
        0)
      * (select count(*) from public.attendees a
          where (a.id = head_id or a.householder_id = head_id)
            and not a.is_under_6
            and a.attendance = 'full')
      -- + 부분 참석 인원 × $100 정액
      + 100
      * (select count(*) from public.attendees a
          where (a.id = head_id or a.householder_id = head_id)
            and not a.is_under_6
            and a.attendance = 'partial')
    )
    else 0
  end::int;
$$;
grant execute on function public.household_total to authenticated;

-- 성도용 RPC: type_selected(객실 타입 선택 여부) → fee_determined(회비 확정 여부)로 교체.
-- 부분 참석만 있는 가구는 객실 타입이 없어도 회비가 확정된다(1인 $100).
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
        -- 숙박하는(전참·6세 이상) 인원이 없으면 객실 타입 없이도 확정
        or not exists (
          select 1 from public.attendees a
          where (a.id = (select id from h) or a.householder_id = (select id from h))
            and not a.is_under_6
            and a.attendance = 'full'
        )
      ) as fee_determined,
      coalesce((select sum(amount)::int from public.fee_payments
                where head_id = (select id from h)), 0) as paid_total
  )
  select total, fee_determined, paid_total, (total - paid_total)::int as balance from c;
$$;
grant execute on function public.my_household_fee to authenticated;
