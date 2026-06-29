-- =====================================================================
-- Phase 3 보강: 공지(announcements) → 자주 묻는 질문(faqs) 교체
-- =====================================================================

-- FAQ (관리자 관리, 공개 읽기)
create table public.faqs (
  id          uuid primary key default gen_random_uuid(),
  question    text not null,
  answer      text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);
create index faqs_order_idx on public.faqs (sort_order, created_at);

alter table public.faqs enable row level security;

-- 누구나 읽기, 관리자만 쓰기
create policy "faqs_public_read" on public.faqs
  for select to anon, authenticated using (true);
create policy "faqs_admin_write" on public.faqs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 공지 기능 제거 (FAQ로 대체)
drop table if exists public.announcements cascade;
