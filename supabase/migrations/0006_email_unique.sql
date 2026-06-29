-- 이메일 중복 등록을 DB 차원에서 차단(동시성/직접 POST 경합 방어).
-- 가구주(head) 행만 email 을 가지므로 partial unique (대소문자 무시).
create unique index attendees_email_uniq
  on public.attendees (lower(email))
  where email is not null;
