-- ============ 납입 건 ↔ 참석자 연결 (개인별 납부) ============
-- 지금까지 원장은 가구주(head_id)에만 묶여 "누가 냈는지"는 비고(note)로만 남았다.
-- attendee_id 를 붙여 개인별 납부(예: 4인실 각자 $200)를 사람 단위로 추적한다.
-- null = 가구 전체 납부 (기존 행 전부 해당).
-- 잔액 계산(household_total / my_household_fee)은 여전히 가구 단위 — 변경 없음.

alter table public.fee_payments
  add column attendee_id uuid references public.attendees(id) on delete set null;

comment on column public.fee_payments.attendee_id is
  '납부 대상 참석자. null = 가구 전체 납부. 참석자 삭제 시 null(가구 납부로 강등)';

create index fee_payments_attendee_idx on public.fee_payments(attendee_id);
