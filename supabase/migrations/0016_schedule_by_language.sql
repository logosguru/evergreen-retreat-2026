-- 언어별로 흩어져 진행하는 순서(성경공부 등) 표시. 기본 false.
alter table public.schedule_items
  add column by_language boolean not null default false;
