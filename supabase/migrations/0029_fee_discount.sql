-- ============ 회비 지원(할인) — 형편이 어려운 성도 ============
-- 교회가 회비의 일부를 부담하는 참석자를 관리자가 개별 지정한다.
-- fee_discount_pct = 감면 비율(%). 현재 UI는 0 / 50 만 쓰지만 컬럼은 0~100 을 허용해
-- 다른 비율이 필요해져도 마이그레이션 없이 늘릴 수 있게 둔다.
--
-- 적용 순서: 면제(fee_waived) → 6세 미만 → 6~12세/부분·전일로 기본 회비를 정한 뒤
-- 마지막에 (100 - pct)% 를 곱한다. 예) 4인실 $200 + 50% → $100.
-- 방 인원 집계에는 영향 없음.
-- TS 쪽 동일 규칙: src/lib/fees.ts personFee().

alter table public.attendees
  add column fee_discount_pct smallint not null default 0
    check (fee_discount_pct between 0 and 100);

comment on column public.attendees.fee_discount_pct is
  '회비 지원 비율 %(관리자 지정). 기본 회비에 (100-pct)% 를 곱한다. 방 인원엔 영향 없음';

-- 관리자 전용 컬럼 보호: fee_discount_pct 추가
create or replace function public.guard_privileged_cols()
returns trigger language plpgsql as $$
begin
  if not public.is_admin() then
    new.paid             := old.paid;
    new.paid_at          := old.paid_at;
    new.retreat_group    := old.retreat_group;
    new.is_group_leader  := old.is_group_leader;
    new.is_householder   := old.is_householder;
    new.householder_id   := old.householder_id;
    new.room_id          := old.room_id;
    new.language         := old.language;
    new.tshirt_size      := old.tshirt_size;
    new.fee_waived       := old.fee_waived;
    new.fee_discount_pct := old.fee_discount_pct;
  end if;
  return new;
end $$;

-- 가구 회비 합계: 인원 카운트 방식(0028) → 사람별 계산 후 합산으로 변경.
-- 감면 비율이 사람마다 다를 수 있으므로 집계로는 표현할 수 없다.
create or replace function public.household_total(head_id uuid)
returns int
language sql stable security definer set search_path = public as $$
  with price as (
    select coalesce(
      (select rt.price_per_person from public.room_types rt
        where rt.id = (select requested_room_type_id from public.attendees where id = head_id)),
      0) as per_person
  ),
  m as (
    select
      case
        when a.fee_waived then 0
        when a.is_under_6 then 0
        -- 6~12세: 부분 $50 / 전일 $100
        when a.is_child_6_12 then (case when a.attendance = 'partial' then 50 else 100 end)
        -- 성인 부분 참석 $100
        when a.attendance = 'partial' then 100
        -- 성인 전일: 가구주가 고른 객실 타입 단가 (미선택이면 0 = 미산정)
        else (select per_person from price)
      end as base,
      a.fee_discount_pct as pct
    from public.attendees a
    where a.id = head_id or a.householder_id = head_id
  )
  select case
    when public.is_admin()
      or head_id in (select public.my_household_head_ids())
    then coalesce(
      (select sum(round(base * (100 - pct) / 100.0))::int from m),
      0)
    else 0
  end::int;
$$;
grant execute on function public.household_total to authenticated;
