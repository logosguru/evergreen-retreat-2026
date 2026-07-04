-- =====================================================================
-- 일정·FAQ 다국어(en/es) 컬럼 — 기존 컬럼은 한국어 원본, en/es는 선택(fallback=ko)
-- RLS 변경 없음 (기존 정책이 테이블 단위 공개읽기/관리자쓰기)
-- =====================================================================

alter table public.schedule_items
  add column title_en       text,
  add column title_es       text,
  add column description_en text,
  add column description_es text,
  add column location_en    text,
  add column location_es    text;

alter table public.faqs
  add column question_en text,
  add column question_es text,
  add column answer_en   text,
  add column answer_es   text;
