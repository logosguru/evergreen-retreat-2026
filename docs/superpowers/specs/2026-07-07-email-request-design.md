# 이메일 등록 신청 설계 (이름 확인 → 본인 이메일 신청 → 관리자 승인)

## Context (배경)

이름 확인(2026-07-05 설계 + 0014 추록)은 import된 가구(head email = null)에 대해
"등록되어 있습니다 — 등록 담당자에게 문의" 카드를 보여준다. 이 기능은 그 카드에서
**본인이 직접 이메일을 신청**할 수 있게 한다. 단, 이름 확인은 익명 공개 화면이라
입력자가 본인인지 알 수 없으므로, 이메일을 즉시 연결하면 남의 이름을 대고 그 가구의
수정 권한(매직링크)을 탈취할 수 있다. 따라서 **신청 → 관리자 확인·승인 → 반영**
구조로 한다.

## 핵심 제약

- **본인 확인 불가 전제**: 신청은 절대 attendees에 직접 반영하지 않는다. 반영은
  관리자가 기존 참석자 편집 화면에서 이메일을 입력하는 행위 그 자체다(자동 반영 없음).
- **명단 비노출**: `email_requests`는 anon INSERT만 허용, SELECT 정책 없음(신청 내용
  타인 열람 불가). 관리자만 전체 SELECT/UPDATE/DELETE.
- **동명이인 매칭은 사람이 판단**: 신청과 attendee 행의 자동 매칭 로직 없음. 관리자가
  이름·전화로 확인해 처리.

## 확정된 결정사항

| 항목 | 결정 |
|---|---|
| 보호 수준 | **관리자 승인 후 반영** (신청 큐, 자동 연결 없음) |
| 승인 방식 | 신청 목록 확인 → **기존 편집 화면에서 이메일 직접 입력** → 신청 [처리 완료] |
| 신청 입력 | 이메일(필수) + 전화번호(선택, 본인 확인 보조) + 이름(확인 단계 입력값 자동 전달) |
| 신청 노출 위치 | 이름 확인의 "등록됨 + 이메일 없음" 카드 내 인라인 미니 폼 |
| 관리자 노출 | `/admin/attendees` 상단 amber 배너 목록 + 대시보드 미처리 건수 카드 |
| 중복 방지 | 같은 이메일의 **미처리** 신청 1건만 (partial unique on lower(email) where not processed) |
| Turnstile | 미적용(등록 제출에만). 교회 내부 대상 + 중복 방지로 수용, 스팸 발생 시 후속 |

## 데이터 — `supabase/migrations/0015_email_requests.sql`

```sql
create table public.email_requests (
  id           uuid primary key default gen_random_uuid(),
  name_entered text not null,          -- 이름 확인 단계에서 입력한 이름 그대로
  email        text not null,
  phone        text,                   -- 선택: 본인 확인 보조
  processed    boolean not null default false,
  created_at   timestamptz not null default now()
);

-- 같은 이메일의 미처리 신청은 1건만
create unique index email_requests_pending_email_idx
  on public.email_requests (lower(email)) where processed = false;

alter table public.email_requests enable row level security;

-- anon/authenticated INSERT만 (신청 접수). SELECT 정책 없음 → 비노출.
create policy email_requests_insert on public.email_requests
  for insert to anon, authenticated with check (true);

-- 관리자 전체 접근
create policy email_requests_admin_select on public.email_requests
  for select to authenticated using (public.is_admin());
create policy email_requests_admin_update on public.email_requests
  for update to authenticated using (public.is_admin());
create policy email_requests_admin_delete on public.email_requests
  for delete to authenticated using (public.is_admin());
```

## 서버 액션

### 성도 측 — `src/app/[locale]/register/actions.ts`

```ts
export type RequestEmailResult = { ok: true } | { ok: false; error: string };
// error: "validationEmail" | "requestDuplicate" | "error"

export async function requestEmail(
  nameRaw: string,
  emailRaw: string,
  phoneRaw: string,
): Promise<RequestEmailResult>;
```

- 이름: `clean()` 후 2자 미만이면 `error`(정상 UI에선 도달 불가 — 확인 단계 통과값).
- 이메일: 기존 정규식 검증(`validationEmail`).
- INSERT 시 unique 위반(23505) → `requestDuplicate`.

### 관리자 측 — `src/app/[locale]/admin/actions.ts`

```ts
export async function setEmailRequestProcessed(id: string): Promise<{ ok: boolean }>;
```

기존 관리자 액션 패턴(`setPaid` 등)과 동일: 서버에서 `getClaims()` admin 확인 후 UPDATE.

## UI

### 성도 — `RegistrationForm` no-email 카드 확장

현재 `nameFoundNoEmailHint` 문단 자리에:

- 안내 문구(`requestEmailIntro`: "아래에 이메일을 남기시면 관리자 확인 후 수정 링크를
  사용하실 수 있습니다.") + 이메일 입력(필수) + 전화번호 입력(선택, `requestPhoneHint`)
  + [이메일 등록 신청](`requestEmailSubmit`) 버튼.
- 제출 성공 → 폼을 성공 문구로 교체(`requestEmailDone`: "신청되었습니다. 관리자 확인
  후 수정 링크를 사용하실 수 있습니다.").
- 실패 → 인라인 에러(`t(error)` 패턴, `requestDuplicate`: "이미 신청되어 있습니다.
  관리자 확인을 기다려 주세요.").
- 기존 담당자 문의 문구는 보조 안내로 폼 아래 유지(`nameFoundNoEmailHint` 문구를
  "직접 신청이 어려우면 등록 담당자(김효진 전도사)에게 문의해 주세요."로 조정).
- 신청 상태는 컴포넌트 state (`requestState: "idle" | "done"` + pending transition).

### 관리자 — `/admin/attendees` 상단 배너 + 대시보드 카드

- **배너**(신규 컴포넌트 `EmailRequestBanner`, 서버에서 미처리 신청 fetch해 props로):
  미처리 신청이 있을 때만 amber 박스 렌더. 각 행: `name_entered` · `email` · `phone`
  · 신청일 + [처리 완료] 버튼(`setEmailRequestProcessed` 호출, `router.refresh()`).
  처리 절차 안내 한 줄(`requestsHint`: "본인 확인 후 참석자 편집에서 이메일을 입력하고
  처리 완료를 눌러 주세요.").
- **대시보드**: 미처리 신청 건수를 등록 현황 카드 옆에 소형 카드로(0건이면 숨김).
  `computeDashboard` 변경 없이 페이지에서 별도 count 쿼리.

## i18n — ko/en/es 동일 키

- `Register`: `requestEmailIntro`, `requestPhoneLabel`, `requestPhoneHint`,
  `requestEmailSubmit`, `requestEmailDone`, `requestDuplicate` (+ 기존
  `nameFoundNoEmailHint` 문구 조정).
- `Admin`: `requestsTitle`, `requestsHint`, `requestProcessed`(버튼),
  `dashEmailRequests`(대시보드 카드 라벨).

## 검증 (Verification)

- **마이그레이션**: `supabase db reset` → psql: anon으로 INSERT 가능·SELECT 차단,
  같은 이메일 미처리 2건째 INSERT는 23505, processed=true 후엔 같은 이메일 재신청 가능,
  관리자(권한 심은 세션)만 SELECT/UPDATE.
- **성도 UI**: no-email 카드에서 신청 → 성공 문구. 중복 신청 → `requestDuplicate`.
  이메일 형식 오류 → `validationEmail`.
- **관리자 UI**: 배너에 신청 표시 → 편집에서 이메일 입력 → [처리 완료] → 배너에서 제거,
  대시보드 카드 건수 갱신. 0건이면 배너·카드 미표시.
- tsc/lint/build, ko/en/es 키 파리티, 콘솔 에러 0.

## 범위 밖 (후속)

- 신청 접수/승인 알림(이메일·푸시) — 관리자가 대시보드에서 확인.
- 신청 시 Turnstile — 스팸 발생 시.
- 오래된 미처리 신청 자동 정리 — 수련회 규모에서 불필요.
