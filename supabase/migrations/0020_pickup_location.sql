-- =====================================================================
-- 차량(교회 밴) 픽업 장소. NULL = 차량 불필요.
-- 성도 본인이 수정 가능한 일반 컬럼 — guard_privileged_cols 대상 아님.
-- =====================================================================
create type public.pickup_location_t as enum ('manhattan', 'flushing', 'long_island');

alter table public.attendees
  add column pickup_location public.pickup_location_t null;
