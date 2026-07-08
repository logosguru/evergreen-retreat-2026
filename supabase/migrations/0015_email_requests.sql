-- =====================================================================
-- 이메일 등록 신청 큐: 이름 확인에서 '등록됨+이메일 없음' 성도가 본인
-- 이메일을 신청. anon INSERT만 허용(SELECT 정책 없음 → 신청 비노출),
-- 관리자만 조회·처리. attendees 자동 반영 없음(관리자 편집으로만 반영).
-- =====================================================================
create table public.email_requests (
  id           uuid primary key default gen_random_uuid(),
  name_entered text not null,          -- 이름 확인 단계 입력값 그대로
  email        text not null,
  phone        text,                   -- 선택: 본인 확인 보조
  processed    boolean not null default false,
  created_at   timestamptz not null default now()
);

-- 같은 이메일의 미처리 신청은 1건만
create unique index email_requests_pending_email_idx
  on public.email_requests (lower(email)) where processed = false;

alter table public.email_requests enable row level security;

-- anon/authenticated INSERT만 (신청 접수). SELECT 정책 없음 → 비노출.
create policy email_requests_insert on public.email_requests
  for insert to anon, authenticated with check (true);

-- 관리자 전체 접근
create policy email_requests_admin_select on public.email_requests
  for select to authenticated using (public.is_admin());
create policy email_requests_admin_update on public.email_requests
  for update to authenticated using (public.is_admin());
create policy email_requests_admin_delete on public.email_requests
  for delete to authenticated using (public.is_admin());
