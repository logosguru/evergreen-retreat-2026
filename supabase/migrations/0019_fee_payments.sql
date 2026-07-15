-- ============ 회비 납입 원장(ledger) ============
-- 관리자가 개별 납입/환불 건(금액·날짜·수단)을 기록. 잔액 = household_total - Σamount.
-- PayPal은 기부 링크 방식(웹훅 없음) → 관리자가 입금 확인 후 수동 기록. 현금도 동일.

create table public.fee_payments (
  id         uuid primary key default gen_random_uuid(),
  head_id    uuid not null references public.attendees(id) on delete cascade,
  amount     int  not null,            -- USD 정수. 음수 = 환불
  method     text,                     -- 'paypal' | 'cash' | 'check' | 'import' 등
  note       text,
  paid_at    date not null,            -- 결제/환불 발생일 (관리자 입력)
  created_at timestamptz not null default now()
);
create index fee_payments_head_idx on public.fee_payments(head_id);
alter table public.fee_payments enable row level security;

-- 현재 세션이 속한 가구의 '가구주 id' 집합 (본인=head면 id, 아니면 householder_id).
-- attendees 정책 안의 재귀를 피하려고 my_attendee_ids(SECURITY DEFINER) 위에 얹는다.
create or replace function public.my_household_head_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct case when is_householder then id else householder_id end
  from public.attendees
  where id in (select public.my_attendee_ids())
    and (is_householder or householder_id is not null);
$$;
grant execute on function public.my_household_head_ids to authenticated;

-- 가구 회비 total = 선택 타입 1인 단가 × (해당 가구 6세 이상 인원수). 미선택/미존재 = 0.
create or replace function public.household_total(head_id uuid)
returns int
language sql stable security definer set search_path = public as $$
  select (
    coalesce(
      (select rt.price_per_person from public.room_types rt
        where rt.id = (select requested_room_type_id from public.attendees where id = head_id)),
      0)
    * (select count(*) from public.attendees a
        where (a.id = head_id or a.householder_id = head_id) and not a.is_under_6)
  )::int;
$$;
grant execute on function public.household_total to authenticated;

-- 성도 자가 삭제: 호출자 가구의 '비-가구주' 멤버만 삭제 (head/타 가구는 무시 → 0 rows).
create or replace function public.remove_my_member(member_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.attendees
  where id = member_id
    and is_householder = false
    and householder_id in (select public.my_household_head_ids());
end $$;
grant execute on function public.remove_my_member to authenticated;

-- RLS: 관리자 전체 CRUD, 성도는 본인 가구 원장 읽기만.
create policy "fee_payments_admin" on public.fee_payments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "fee_payments_select_own" on public.fee_payments
  for select to authenticated
  using (head_id in (select public.my_household_head_ids()));

-- guard 트리거 재작성: paid 후 객실 타입 잠금 제거(성도가 납부 후에도 타입 변경 가능).
-- 나머지 관리자 전용 컬럼 보호는 유지.
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
  end if;
  return new;
end $$;

-- 회비 RPC 재작성: paid_total(원장 합계)·balance 반환.
drop function if exists public.my_household_fee();
create function public.my_household_fee()
returns table (total int, type_selected boolean, paid_total int, balance int)
language sql stable security definer set search_path = public as $$
  with h as (
    select id, requested_room_type_id
    from public.attendees
    where id in (select public.my_household_head_ids())
    limit 1
  )
  select
    public.household_total((select id from h)) as total,
    (select requested_room_type_id from h) is not null as type_selected,
    coalesce((select sum(amount)::int from public.fee_payments
              where head_id = (select id from h)), 0) as paid_total,
    (public.household_total((select id from h))
      - coalesce((select sum(amount)::int from public.fee_payments
                  where head_id = (select id from h)), 0))::int as balance;
$$;
grant execute on function public.my_household_fee to authenticated;

-- 백필: 기존 paid=true 가구주는 원장 1건('import')으로 이관해 잔액을 0에서 출발.
insert into public.fee_payments (head_id, amount, method, note, paid_at)
select a.id, public.household_total(a.id), 'import', '기존 납부 이관',
       coalesce(a.paid_at::date, current_date)
from public.attendees a
where a.is_householder and a.paid and public.household_total(a.id) > 0;
