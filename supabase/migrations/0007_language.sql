-- =====================================================================
-- Phase 4: 성도 언어 구분 (관리자 지정, UI 로케일과 별개)
-- =====================================================================
create type public.language_t as enum ('ko', 'en', 'es');  -- 한국어/영어/Spanish

alter table public.attendees
  add column language public.language_t not null default 'ko';

-- 관리자 전용 컬럼 보호: language 추가 (비관리자 UPDATE 시 OLD 복원)
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
