-- =====================================================================
-- Phase 3: 스케줄 + 공지 (공개 읽기 / 관리자 쓰기)
-- =====================================================================

-- 스케줄 항목 (관리자 관리, 공개 읽기)
create table public.schedule_items (
  id          uuid primary key default gen_random_uuid(),
  day         date not null,
  start_time  time not null,
  title       text not null,
  description text,
  location    text,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);
create index schedule_items_day_idx on public.schedule_items (day, start_time, sort_order);

-- 공지사항 (관리자 관리, 공개는 published 만)
create table public.announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  pinned       boolean not null default false,
  published    boolean not null default true,
  published_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index announcements_order_idx on public.announcements (pinned desc, published_at desc);
create trigger trg_ann_updated before update on public.announcements
  for each row execute function public.set_updated_at();

-- RLS
alter table public.schedule_items enable row level security;
alter table public.announcements  enable row level security;

-- 스케줄: 누구나 읽기, 관리자만 쓰기
create policy "schedule_public_read" on public.schedule_items
  for select to anon, authenticated using (true);
create policy "schedule_admin_write" on public.schedule_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 공지: 공개는 published=true 만, 관리자는 전부(미게시 포함)
create policy "ann_public_read" on public.announcements
  for select to anon, authenticated using (published);
create policy "ann_admin_all" on public.announcements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
