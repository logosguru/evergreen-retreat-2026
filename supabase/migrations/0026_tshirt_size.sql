-- ============ 티셔츠 사이즈 ============
-- 수련회 티셔츠 배부용. 관리자 전용 컬럼(참석자 상세 페이지에서만 지정).
-- TS 쪽 동일 토큰: src/lib/types.ts TSHIRT_SIZES. 라벨은 i18n "Tshirt" 네임스페이스.

create type public.tshirt_size_t as enum
  ('xxxs', 'xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl');

alter table public.attendees
  add column tshirt_size public.tshirt_size_t;  -- nullable = 미지정

comment on column public.attendees.tshirt_size is
  '티셔츠 사이즈 (관리자 지정, null=미지정)';

-- 관리자 전용 컬럼 보호: tshirt_size 추가 (비관리자 UPDATE 시 OLD 복원)
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
  end if;
  return new;
end $$;
