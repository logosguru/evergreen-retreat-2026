-- =====================================================================
-- 이름 확인 3번째 상태: '등록됨 + 가구 이메일 없음' 구분
-- import된 가구 등 head email이 없는 경우, 기존엔 빈 배열 → UI가
-- '등록 내역 없음'으로 오안내(중복 등록 유발). matched 여부와 마스킹
-- 이메일 배열을 분리해 jsonb로 반환한다. (명단 비노출 유지)
-- =====================================================================

-- 반환 타입 변경은 create or replace 불가 → drop 후 재생성
drop function public.name_registered(text);

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
