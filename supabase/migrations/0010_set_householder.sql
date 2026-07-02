-- =====================================================================
-- 관리자 가구주 재지정 (원자적)
-- target 을 독립 가구주로(new_head=null) 또는 특정 가구의 구성원으로(new_head 지정) 이동.
-- 구성원을 가진 가구주를 다른 가구로 옮기면 남은 구성원 중 최선등록자(created_at)를
-- 새 가구주로 승격하고 나머지를 재연결(삭제 RPC와 동일 규칙). 함수=단일 트랜잭션.
-- SECURITY INVOKER(기본): 내부 쿼리는 호출한 관리자의 RLS로 실행.
-- =====================================================================

create or replace function public.admin_set_householder(target uuid, new_head uuid)
returns void
language plpgsql
as $$
declare
  t_is_head boolean;
  nh_is_head boolean;
  promoted uuid;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  select is_householder into t_is_head from public.attendees where id = target;
  if t_is_head is null then
    raise exception 'target not found';
  end if;

  -- new_head 지정 시 유효성 검증 (실존 + 가구주 + self 아님)
  if new_head is not null then
    if new_head = target then
      raise exception 'cannot attach to self';
    end if;
    select is_householder into nh_is_head from public.attendees where id = new_head;
    if nh_is_head is null then
      raise exception 'new head not found';
    end if;
    if not nh_is_head then
      raise exception 'new head is not a householder';
    end if;
  end if;

  -- 구성원을 가진 가구주가 다른 가구의 구성원으로 강등되는 경우 → 남은 구성원 승격
  if t_is_head and new_head is not null then
    select id into promoted
      from public.attendees
      where householder_id = target
      order by created_at asc
      limit 1;
    if promoted is not null then
      update public.attendees
        set is_householder = true, householder_id = null
        where id = promoted;
      update public.attendees
        set householder_id = promoted
        where householder_id = target and id <> promoted;
    end if;
  end if;

  if new_head is null then
    update public.attendees
      set is_householder = true, householder_id = null
      where id = target;
  else
    update public.attendees
      set is_householder = false, householder_id = new_head
      where id = target;
  end if;
end $$;

grant execute on function public.admin_set_householder(uuid, uuid) to authenticated;
