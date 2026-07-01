-- =====================================================================
-- 관리자 참석자 삭제 + 가구주 승격 (원자적)
-- 가구주 삭제 시 남은 구성원 중 가장 먼저 등록된(created_at) 1명을 새 가구주로
-- 승격하고 나머지 구성원을 재지정한 뒤 삭제. 함수=단일 트랜잭션이라 원자적.
-- SECURITY INVOKER(기본): 내부 쿼리는 호출한 관리자의 RLS로 실행.
-- =====================================================================

create or replace function public.admin_delete_attendee(target uuid)
returns void
language plpgsql
as $$
declare
  is_head boolean;
  new_head uuid;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  select is_householder into is_head from public.attendees where id = target;
  if is_head is null then
    return;  -- 존재하지 않는 id: no-op
  end if;

  if is_head then
    select id into new_head
      from public.attendees
      where householder_id = target
      order by created_at asc
      limit 1;
    if new_head is not null then
      update public.attendees
        set is_householder = true, householder_id = null
        where id = new_head;
      update public.attendees
        set householder_id = new_head
        where householder_id = target and id <> new_head;
    end if;
  end if;

  delete from public.attendees where id = target;  -- 이 시점엔 참조 구성원 없음
end $$;

grant execute on function public.admin_delete_attendee(uuid) to authenticated;
