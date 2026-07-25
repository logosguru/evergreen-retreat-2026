-- =====================================================================
-- 이름 확인 완화: 전체 이름 정확 일치 외에 이름 토큰(공백 구분) 일치도 허용.
-- "Joey"만 입력해도 "Joey Kim"이 검색되도록 — first/last name 단독 검색 지원.
-- 정규화(공백 제거+소문자)·2자 미만 무시·명단 비노출(마스킹 이메일만)은 유지.
-- =====================================================================

create or replace function public.name_registered(check_name text)
returns jsonb
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
        or
        -- 이름의 공백 구분 토큰(성/이름 등) 단독 일치 (한/영 모두)
        norm.q in (
          select lower(t)
          from regexp_split_to_table(
                 coalesce(a.korean_name, '') || ' ' || coalesce(a.english_name, ''),
                 '\s+'
               ) as t
        )
      )
  ),
  head_emails as (
    select distinct coalesce(h.email, m.email) as email
    from matched m
    left join public.attendees h on h.id = m.householder_id
  )
  select jsonb_build_object(
    'matched', exists (select 1 from matched),
    'masked_emails', coalesce(
      (select array_agg(distinct public.mask_email(email))
       from head_emails
       where email is not null),
      '{}'
    )
  );
$$;

grant execute on function public.name_registered(text) to anon, authenticated;
