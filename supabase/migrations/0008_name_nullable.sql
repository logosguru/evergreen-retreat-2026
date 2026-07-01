-- =====================================================================
-- attendees.korean_name nullable 화 + 이름 최소 하나 보장
-- 영어 전용 등록자(한글 이름 없음)를 수용. korean_name 또는 english_name
-- 중 최소 하나는 반드시 존재해야 한다.
-- =====================================================================

alter table public.attendees
  alter column korean_name drop not null;

alter table public.attendees
  add constraint name_required
  check (korean_name is not null or english_name is not null);
