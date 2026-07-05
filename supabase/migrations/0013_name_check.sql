-- =====================================================================
-- 등록 여부 이름 확인: 정규화 정확 일치 → 마스킹된 가구 대표 이메일 배열 반환
-- (명단 비노출 유지 — 원본 이메일·행 데이터는 반환하지 않음)
-- =====================================================================

-- 이메일 마스킹: joeykim@gmail.com → jo***@gm***.com
create or replace function public.mask_email(addr text)
returns text
language sql
immutable
as $$
  select left(split_part(addr, '@', 1), 2) || '***@'
      || left(split_part(split_part(addr, '@', 2), '.', 1), 2) || '***.'
      || regexp_replace(split_part(addr, '@', 2), '^.*\.', '');
$$;

-- 입력한 이름(공백 제거+소문자 정규화, 정확 일치)이 korean_name/english_name
-- 어느 쪽이든 일치하면, 일치자들의 가구 대표(head) 이메일을 마스킹·중복 제거해
-- 배열로 반환. 빈 배열 = 미등록. 2자 미만 입력은 빈 배열.
create or replace function public.name_registered(check_name text)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with norm as (
    select lower(regexp_replace(coalesce(check_name, ''), '\s', '', 'g')) as q
  ),
  matched as (
    select a.email, a.householder_id
    from public.attendees a, norm
    where length(norm.q) >= 2
      and (
        lower(regexp_replace(coalesce(a.korean_name,  ''), '\s', '', 'g')) = norm.q
        or
        lower(regexp_replace(coalesce(a.english_name, ''), '\s', '', 'g')) = norm.q
      )
  ),
  head_emails as (
    select distinct coalesce(h.email, m.email) as email
    from matched m
    left join public.attendees h on h.id = m.householder_id
  )
  select coalesce(array_agg(distinct public.mask_email(email)), '{}')
  from head_emails
  where email is not null;
$$;

grant execute on function public.name_registered(text) to anon, authenticated;
