-- =====================================================================
-- 부분 참석 도착/출발: 시간 제거(날짜만) + nullable
-- 정확한 날짜는 대부분 나중에 확정되므로 partial이어도 날짜 없이 저장 허용.
-- date 타입이라 타임존 이슈도 원천 차단(기존 wall-clock 값은 UTC 기준 날짜로 보존).
-- =====================================================================

alter table public.attendees
  drop constraint if exists partial_requires_times;

alter table public.attendees
  alter column arrival_at type date using (arrival_at at time zone 'utc')::date,
  alter column departure_at type date using (departure_at at time zone 'utc')::date;

comment on column public.attendees.arrival_at is '부분 참석 도착일(선택, 추후 확정 가능)';
comment on column public.attendees.departure_at is '부분 참석 출발일(선택, 추후 확정 가능)';
