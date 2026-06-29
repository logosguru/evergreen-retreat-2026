-- =====================================================================
-- 등록 이메일 중복 확인: 존재 여부(boolean)만 반환(명단 비노출 유지)
-- =====================================================================
create or replace function public.email_registered(check_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.attendees
    where email is not null and lower(email) = lower(check_email)
  );
$$;

grant execute on function public.email_registered(text) to anon, authenticated;
