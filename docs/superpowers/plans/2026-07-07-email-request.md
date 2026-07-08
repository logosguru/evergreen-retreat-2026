# 이메일 등록 신청 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이름 확인에서 "등록됨 + 이메일 없음" 성도가 본인 이메일을 신청하고, 관리자가 확인 후 기존 편집으로 반영하는 신청 큐를 만든다.

**Architecture:** anon INSERT만 허용하는 `email_requests` 테이블(SELECT 정책 없음 → 신청 비노출)에 신청을 접수한다. 성도는 no-email 카드 내 미니 폼에서 `requestEmail` 서버 액션으로 신청하고, 관리자는 `/admin/attendees` 상단 배너에서 신청을 확인해 기존 참석자 편집으로 이메일을 입력한 뒤 `setEmailRequestProcessed`로 신청을 마감한다. attendees 자동 반영은 절대 없다(승인 = 관리자의 편집 행위).

**Tech Stack:** Next.js 16(App Router, 서버 액션) · Supabase(@supabase/ssr, RLS) · next-intl v4 · TypeScript · Tailwind v4

**Spec:** `docs/superpowers/specs/2026-07-07-email-request-design.md`

## Global Constraints

- **자동 반영 금지**: 신청은 절대 `attendees`에 직접 쓰지 않는다. 반영은 관리자가 편집 화면에서 이메일을 입력하는 것뿐.
- **명단/신청 비노출**: `email_requests`는 anon INSERT만, SELECT 정책 없음. 관리자만 SELECT/UPDATE/DELETE(`public.is_admin()`). 서버 컴포넌트 fetch는 관리자 세션이므로 RLS 통과.
- **중복 방지**: 같은 이메일의 **미처리** 신청은 1건 — `unique index (lower(email)) where processed = false`. 위반(23505) → `requestDuplicate`.
- **관리자 액션 인증**: mutation 서버 액션은 기존 패턴대로 `getClaims()`로 `app_role === "admin"` 확인(`isAdminSession` 헬퍼 재사용). INSERT/UPDATE는 RLS가 막지만 이중 방어.
- **Supabase 클라이언트**: `@/lib/supabase/server`의 `createClient()`(async, await 필수).
- **i18n**: `useTranslations`/`getTranslations`는 컴포넌트 상단에서만. **ko/en/es 3파일 키 파리티 필수**. 폼 에러 문자열 = 메시지 키(`t(error)`).
- **문구 규칙**: '교우' 금지 → '성도'. 스페인어 UI는 usted체.
- **검증 도구**(단위 테스트 러너 없음): `npx tsc --noEmit`, `npm run lint`, `npm run build`, `supabase db reset` + `docker exec -i supabase_db_retreat2026 psql -U postgres -d postgres`, `npm run dev` + Playwright MCP.
- **커밋 메시지** 말미: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- 작업 브랜치: `email-request` (Task 1 Step 0에서 생성).

---

### Task 1: 마이그레이션 0015 — `email_requests` 테이블 + RLS

**Files:**
- Create: `supabase/migrations/0015_email_requests.sql`

**Interfaces:**
- Produces: 테이블 `public.email_requests(id uuid pk, name_entered text not null, email text not null, phone text, processed boolean not null default false, created_at timestamptz not null default now())`. anon/authenticated INSERT 허용, 관리자(`public.is_admin()`) SELECT/UPDATE/DELETE. partial unique `email_requests_pending_email_idx` on `lower(email)` where `processed = false`.

- [ ] **Step 0: 브랜치 생성**

Run: `git checkout -b email-request`

- [ ] **Step 1: 마이그레이션 작성**

Create `supabase/migrations/0015_email_requests.sql`:
```sql
-- =====================================================================
-- 이메일 등록 신청 큐: 이름 확인에서 '등록됨+이메일 없음' 성도가 본인
-- 이메일을 신청. anon INSERT만 허용(SELECT 정책 없음 → 신청 비노출),
-- 관리자만 조회·처리. attendees 자동 반영 없음(관리자 편집으로만 반영).
-- =====================================================================
create table public.email_requests (
  id           uuid primary key default gen_random_uuid(),
  name_entered text not null,          -- 이름 확인 단계 입력값 그대로
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

- [ ] **Step 2: 마이그레이션 적용**

Run: `supabase db reset` (로컬 Supabase 꺼져 있으면 `supabase start` 먼저; Docker 필요)
Expected: 0001~0015 오류 없이 적용, `Finished supabase db reset`.

- [ ] **Step 3: psql로 RLS·중복 검증**

Run:
```bash
docker exec -i supabase_db_retreat2026 psql -U postgres -d postgres <<'SQL'
-- anon 역할: INSERT 가능, SELECT 차단
set role anon;
insert into public.email_requests (name_entered, email, phone) values ('이재훈', 'test@x.com', '1234');
select count(*) from public.email_requests;   -- RLS: 0행
reset role;

-- 미처리 중복 차단
insert into public.email_requests (name_entered, email) values ('이재훈', 'TEST@x.com');  -- 23505 기대
SQL
```
Expected: anon INSERT 1건 성공, anon `select count(*)` = **0**(SELECT 정책 없음), 두 번째 INSERT는 `ERROR: duplicate key value violates unique constraint "email_requests_pending_email_idx"`.

- [ ] **Step 4: psql로 processed 후 재신청 허용 검증**

Run:
```bash
docker exec -i supabase_db_retreat2026 psql -U postgres -d postgres <<'SQL'
-- postgres(superuser)로 상태 확인·전이
select email, processed from public.email_requests;
update public.email_requests set processed = true where lower(email) = 'test@x.com';
-- 처리 완료 후 같은 이메일 재신청 가능
insert into public.email_requests (name_entered, email) values ('이재훈', 'test@x.com');
select email, processed from public.email_requests order by created_at;
-- cleanup
delete from public.email_requests where lower(email) = 'test@x.com';
SQL
```
Expected: 첫 행 processed=false → true 전이 후 재INSERT 성공(미처리 1 + 처리완료 1 = 2행), cleanup으로 삭제.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0015_email_requests.sql
git commit -m "feat(db): email_requests 신청 큐 테이블 + RLS(0015)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 성도 서버 액션 `requestEmail()`

**Files:**
- Modify: `src/app/[locale]/register/actions.ts` (파일 끝, `checkName` 아래에 추가)

**Interfaces:**
- Consumes: `clean()` from `@/lib/attendee-rows`(이미 import됨), `createClient()` from `@/lib/supabase/server`(이미 import됨).
- Produces: `requestEmail(nameRaw: string, emailRaw: string, phoneRaw: string): Promise<RequestEmailResult>`, `type RequestEmailResult = { ok: true } | { ok: false; error: string }`. 에러 키: `"validationEmail"`, `"requestDuplicate"`, `"error"`.

- [ ] **Step 1: 액션 추가**

`src/app/[locale]/register/actions.ts` 파일 끝(기존 `checkName` 뒤)에 추가:
```ts
export type RequestEmailResult = { ok: true } | { ok: false; error: string };

// 이름 확인에서 '등록됨+이메일 없음' 성도가 본인 이메일을 신청. attendees에
// 반영하지 않고 email_requests에 접수만 — 관리자가 확인 후 편집으로 반영한다.
export async function requestEmail(
  nameRaw: string,
  emailRaw: string,
  phoneRaw: string,
): Promise<RequestEmailResult> {
  const name = clean(nameRaw);
  const email = clean(emailRaw);
  const phone = clean(phoneRaw);
  if (!name) return { ok: false, error: "error" };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "validationEmail" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("email_requests")
    .insert({ name_entered: name, email, phone });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "requestDuplicate" };
    return { ok: false, error: "error" };
  }
  return { ok: true };
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 3: Commit**

```bash
git add src/app/[locale]/register/actions.ts
git commit -m "feat(register): requestEmail 서버 액션 — 이메일 등록 신청 접수

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 관리자 서버 액션 `setEmailRequestProcessed()`

**Files:**
- Modify: `src/app/[locale]/admin/actions.ts` (파일 끝에 추가)

**Interfaces:**
- Consumes: `createClient()`(이미 import됨), `isAdminSession()`(파일 내 기존 헬퍼).
- Produces: `setEmailRequestProcessed(id: string): Promise<{ ok: boolean }>`. 미처리 신청을 processed=true로.

- [ ] **Step 1: 액션 추가**

`src/app/[locale]/admin/actions.ts` 파일 끝에 추가:
```ts
// 이메일 신청 처리 완료 (관리자 전용). 관리자가 본인 확인 후 참석자 편집에서
// 이메일을 입력하고 이 액션으로 신청을 마감한다.
export async function setEmailRequestProcessed(
  id: string,
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  if (!(await isAdminSession(supabase))) return { ok: false };
  const { error } = await supabase
    .from("email_requests")
    .update({ processed: true })
    .eq("id", id);
  return { ok: !error };
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 3: Commit**

```bash
git add src/app/[locale]/admin/actions.ts
git commit -m "feat(admin): setEmailRequestProcessed 액션 — 이메일 신청 마감

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: i18n 키 추가 (ko/en/es)

**Files:**
- Modify: `messages/ko.json`, `messages/en.json`, `messages/es.json`

**Interfaces:**
- Produces: `Register` 네임스페이스 6키 — `requestEmailIntro`, `requestPhoneLabel`, `requestPhoneHint`, `requestEmailSubmit`, `requestEmailDone`, `requestDuplicate`; `nameFoundNoEmailHint` 문구 조정(보조 안내). `Admin` 네임스페이스 4키 — `requestsTitle`, `requestsHint`, `requestProcessed`, `dashEmailRequests`.

- [ ] **Step 1: ko.json**

`messages/ko.json` `Register` 네임스페이스에서 기존 `nameFoundNoEmailHint` 값을 아래로 **교체**:
```json
"nameFoundNoEmailHint": "직접 신청이 어려우면 등록 담당자(김효진 전도사)에게 문의해 주세요.",
```
그리고 `Register` 네임스페이스 끝(마지막 키 뒤, 콤마 주의)에 추가:
```json
"requestEmailIntro": "아래에 이메일을 남기시면 관리자 확인 후 수정 링크를 사용하실 수 있습니다.",
"requestPhoneLabel": "전화번호 (선택)",
"requestPhoneHint": "본인 확인에 도움이 됩니다.",
"requestEmailSubmit": "이메일 등록 신청",
"requestEmailDone": "신청되었습니다. 관리자 확인 후 수정 링크를 사용하실 수 있습니다.",
"requestDuplicate": "이미 신청되어 있습니다. 관리자 확인을 기다려 주세요."
```
`messages/ko.json` `Admin` 네임스페이스 끝에 추가:
```json
"requestsTitle": "이메일 등록 신청",
"requestsHint": "본인 확인 후 참석자 편집에서 이메일을 입력하고 처리 완료를 눌러 주세요.",
"requestProcessed": "처리 완료",
"dashEmailRequests": "이메일 신청 대기"
```

- [ ] **Step 2: en.json**

`Register`의 `nameFoundNoEmailHint` 교체:
```json
"nameFoundNoEmailHint": "If you cannot submit a request yourself, please contact Minister Joyce Kim.",
```
`Register` 끝에 추가:
```json
"requestEmailIntro": "Leave your email below and you can use the edit link once an administrator confirms it.",
"requestPhoneLabel": "Phone (optional)",
"requestPhoneHint": "Helps us verify it is you.",
"requestEmailSubmit": "Request email registration",
"requestEmailDone": "Request submitted. You can use the edit link once an administrator confirms it.",
"requestDuplicate": "A request is already pending. Please wait for administrator confirmation."
```
`Admin` 끝에 추가:
```json
"requestsTitle": "Email registration requests",
"requestsHint": "After verifying identity, enter the email on the attendee edit page and mark it processed.",
"requestProcessed": "Mark processed",
"dashEmailRequests": "Pending email requests"
```

- [ ] **Step 3: es.json**

`Register`의 `nameFoundNoEmailHint` 교체:
```json
"nameFoundNoEmailHint": "Si no puede enviar la solicitud usted mismo, por favor contacte a la ministra Joyce Kim.",
```
`Register` 끝에 추가:
```json
"requestEmailIntro": "Deje su correo a continuación y podrá usar el enlace de edición una vez que un administrador lo confirme.",
"requestPhoneLabel": "Teléfono (opcional)",
"requestPhoneHint": "Nos ayuda a verificar su identidad.",
"requestEmailSubmit": "Solicitar registro de correo",
"requestEmailDone": "Solicitud enviada. Podrá usar el enlace de edición una vez que un administrador la confirme.",
"requestDuplicate": "Ya hay una solicitud pendiente. Por favor espere la confirmación del administrador."
```
`Admin` 끝에 추가:
```json
"requestsTitle": "Solicitudes de registro de correo",
"requestsHint": "Tras verificar la identidad, ingrese el correo en la página de edición del asistente y márquela como procesada.",
"requestProcessed": "Marcar procesada",
"dashEmailRequests": "Solicitudes de correo pendientes"
```

- [ ] **Step 4: 키 파리티 검증**

Run:
```bash
python3 -c "
import json
for ns in ['Register','Admin']:
    ks = {loc: set(json.load(open(f'messages/{loc}.json'))[ns].keys()) for loc in ['ko','en','es']}
    assert ks['ko']==ks['en']==ks['es'], (ns, ks['ko']^ks['en'], ks['ko']^ks['es'])
    print(ns, 'OK', len(ks['ko']), 'keys')
"
```
Expected: `Register OK 45 keys` / `Admin OK <n> keys` (파리티 통과 — 정확한 수치보다 assert 통과가 기준).

- [ ] **Step 5: Commit**

```bash
git add messages/ko.json messages/en.json messages/es.json
git commit -m "feat(i18n): 이메일 등록 신청 문구 ko/en/es

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 성도 UI — no-email 카드에 신청 폼

**Files:**
- Modify: `src/components/RegistrationForm.tsx`

**Interfaces:**
- Consumes: `requestEmail`(Task 2), i18n 키(Task 4), 기존 `labelClass`/`inputClass`, 기존 `checking`(useTransition)·`nameInput` state.
- Produces: 없음(리프 컴포넌트).

- [ ] **Step 1: import에 requestEmail 추가**

기존 register/actions import 블록에 `requestEmail` 추가:
```ts
import {
  insertRegistration,
  checkEmail,
  checkName,
  requestEmail,
  type PersonInput,
  type RegistrationPayload,
} from "@/app/[locale]/register/actions";
```

- [ ] **Step 2: 신청 state·핸들러 추가**

컴포넌트 내 이름 확인 state 블록(`nameResult` 아래)에 추가:
```ts
// 이메일 없음 카드: 본인 이메일 신청
const [reqEmail, setReqEmail] = useState("");
const [reqPhone, setReqPhone] = useState("");
const [reqError, setReqError] = useState<string | null>(null);
const [reqDone, setReqDone] = useState(false);
```
`submitName` 함수 아래에 핸들러 추가:
```ts
function submitRequest(e: React.FormEvent) {
  e.preventDefault();
  setReqError(null);
  startCheck(async () => {
    const res = await requestEmail(nameInput, reqEmail, reqPhone);
    if (!res.ok) {
      setReqError(res.error);
      return;
    }
    setReqDone(true);
  });
}
```
그리고 이름 입력 `onChange`에서 결과 초기화 시 신청 상태도 초기화 — 기존 `onChange`의 두 setter 뒤에 추가:
```ts
                  setNameResult(null);
                  setNameError(null);
                  setReqError(null);
                  setReqDone(false);
```

- [ ] **Step 3: no-email 카드 JSX 교체**

`nameResult.maskedEmails.length > 0` 의 else 분기(현재 `<p ...>{t("nameFoundNoEmailHint")}</p>` 한 줄)를 다음으로 교체:
```tsx
                ) : reqDone ? (
                  <p className="mt-1 text-sm text-amber-800">
                    {t("requestEmailDone")}
                  </p>
                ) : (
                  <div className="mt-2 space-y-3">
                    <p className="text-sm text-amber-800">
                      {t("requestEmailIntro")}
                    </p>
                    <div className="space-y-2">
                      <input
                        type="email"
                        required
                        value={reqEmail}
                        onChange={(e) => {
                          setReqEmail(e.target.value);
                          setReqError(null);
                        }}
                        className={inputClass}
                        placeholder="you@example.com"
                        aria-label={tf("email")}
                      />
                      <input
                        type="tel"
                        value={reqPhone}
                        onChange={(e) => setReqPhone(e.target.value)}
                        className={inputClass}
                        placeholder={t("requestPhoneLabel")}
                        aria-label={t("requestPhoneLabel")}
                      />
                      <p className="text-xs text-amber-700">
                        {t("requestPhoneHint")}
                      </p>
                    </div>
                    {reqError && (
                      <p className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
                        {t(reqError)}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={submitRequest}
                      disabled={checking}
                      className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {checking ? tc("submitting") : t("requestEmailSubmit")}
                    </button>
                    <p className="text-xs text-amber-700">
                      {t("nameFoundNoEmailHint")}
                    </p>
                  </div>
                )}
```

> 신청 버튼은 이름 확인 폼(`submitName`) 안에 있으므로 `type="button"` + onClick으로 처리(폼 중첩/이중 submit 방지). `tc` = `useTranslations("Common")`, `submitting` 키는 기존 존재.

- [ ] **Step 4: 정적 검증**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 모두 오류 없음.

- [ ] **Step 5: 브라우저 검증**

사전: `supabase start` + `npm run dev`. psql로 이메일 없는 가구 seed:
```bash
docker exec -i supabase_db_retreat2026 psql -U postgres -d postgres -c "insert into public.attendees (id, korean_name, email, is_householder, householder_id) values ('00000000-0000-0000-0000-0000000000a1', '이재훈', null, true, null);"
```
http://localhost:3000/register 에서 (Playwright MCP):
1. 이름 탭 → "이재훈" 확인 → amber 카드에 이메일/전화 입력 + [이메일 등록 신청] 버튼.
2. 이메일 `me@test.com` + 전화 입력 → 신청 → `requestEmailDone` 문구로 교체.
3. psql로 접수 확인: `select name_entered,email,phone,processed from email_requests;` → 1행(processed=false).
4. 같은 이름 재확인 → 다시 신청(같은 이메일) → `requestDuplicate` 인라인 에러.
5. 잘못된 이메일 형식 → `validationEmail`.
6. 콘솔 에러 0.
7. cleanup: `delete from email_requests; delete from attendees where id='00000000-0000-0000-0000-0000000000a1';`

- [ ] **Step 6: Commit**

```bash
git add src/components/RegistrationForm.tsx
git commit -m "feat(register): 이메일 없음 카드에 본인 이메일 신청 폼

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 관리자 UI — 신청 배너 + 대시보드 카드

**Files:**
- Create: `src/components/EmailRequestBanner.tsx`
- Modify: `src/app/[locale]/admin/(protected)/attendees/page.tsx`
- Modify: `src/app/[locale]/admin/(protected)/page.tsx` (대시보드 미처리 건수 카드)

**Interfaces:**
- Consumes: `setEmailRequestProcessed`(Task 3), i18n `Admin` 키(Task 4).
- Produces: `EmailRequestBanner` 클라이언트 컴포넌트 — props `requests: EmailRequest[]`, `EmailRequest = { id: string; name_entered: string; email: string; phone: string | null; created_at: string }`.

- [ ] **Step 1: EmailRequestBanner 컴포넌트 작성**

Create `src/components/EmailRequestBanner.tsx`:
```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { setEmailRequestProcessed } from "@/app/[locale]/admin/actions";

export type EmailRequest = {
  id: string;
  name_entered: string;
  email: string;
  phone: string | null;
  created_at: string;
};

export function EmailRequestBanner({ requests }: { requests: EmailRequest[] }) {
  const t = useTranslations("Admin");
  const router = useRouter();
  const [pending, start] = useTransition();

  if (requests.length === 0) return null;

  function markProcessed(id: string) {
    start(async () => {
      await setEmailRequestProcessed(id);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl bg-amber-50 p-5 ring-1 ring-amber-200">
      <p className="text-base font-semibold text-amber-900">
        {t("requestsTitle")} ({requests.length})
      </p>
      <p className="mt-1 text-sm text-amber-800">{t("requestsHint")}</p>
      <ul className="mt-3 space-y-2">
        {requests.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-amber-100"
          >
            <span className="font-semibold text-slate-900">
              {r.name_entered}
            </span>
            <span className="font-mono text-slate-700">{r.email}</span>
            {r.phone && <span className="text-slate-500">{r.phone}</span>}
            <span className="text-xs text-slate-400">
              {r.created_at.slice(0, 10)}
            </span>
            <button
              type="button"
              onClick={() => markProcessed(r.id)}
              disabled={pending}
              className="ml-auto rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {t("requestProcessed")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: 참석자 페이지에서 신청 fetch + 배너 렌더**

`src/app/[locale]/admin/(protected)/attendees/page.tsx` 수정.

(a) import 추가:
```ts
import { EmailRequestBanner, type EmailRequest } from "@/components/EmailRequestBanner";
```
(b) 기존 attendees 쿼리 뒤에 신청 fetch 추가:
```ts
  const { data: reqData } = await supabase
    .from("email_requests")
    .select("id, name_entered, email, phone, created_at")
    .eq("processed", false)
    .order("created_at", { ascending: true });
  const requests = (reqData as EmailRequest[] | null) ?? [];
```
(c) `<AdminAttendeeTable ...>`를 감싼 `<div className="mt-6">` **앞에** 배너 삽입:
```tsx
      <div className="mt-6">
        <EmailRequestBanner requests={requests} />
      </div>
      <div className="mt-6">
        <AdminAttendeeTable attendees={attendees} />
      </div>
```

- [ ] **Step 3: 대시보드 미처리 건수 카드**

`src/app/[locale]/admin/(protected)/page.tsx` 수정.

(a) 기존 `Promise.all` 배열에 신청 count 쿼리 추가(head-only count):
```ts
  const [{ data: aData }, { data: rData }, { count: reqCount }] =
    await Promise.all([
      supabase
        .from("attendees")
        .select("*, rooms(label, room_types(name, price_per_person))"),
      supabase.from("rooms").select("room_types(name, capacity)"),
      supabase
        .from("email_requests")
        .select("id", { count: "exact", head: true })
        .eq("processed", false),
    ]);
```
(b) `<AdminDashboard stats={stats} />` 위에 조건부 카드 추가:
```tsx
      {(reqCount ?? 0) > 0 && (
        <div className="mt-6 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            {t("dashEmailRequests")}
          </p>
          <p className="mt-1 text-2xl font-bold text-amber-800">{reqCount}</p>
        </div>
      )}
      <div className="mt-6">
        <AdminDashboard stats={stats} />
      </div>
```
(기존 `<div className="mt-6"><AdminDashboard .../></div>`는 그대로 두고 그 앞에 카드 추가.)

- [ ] **Step 4: 정적 검증**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 모두 오류 없음.

- [ ] **Step 5: 브라우저 검증(관리자)**

사전: `supabase start` + `npm run dev` + 관리자 로그인(logosguru@gmail.com 매직링크, Mailpit http://127.0.0.1:54324). psql로 미처리 신청 seed:
```bash
docker exec -i supabase_db_retreat2026 psql -U postgres -d postgres -c "insert into public.email_requests (name_entered, email, phone) values ('이재훈','me@test.com','010-1234');"
```
Playwright MCP로:
1. `/admin` 대시보드 → "이메일 신청 대기" 카드에 1 표시.
2. `/admin/attendees` → 상단 amber 배너에 신청 1건(이름·이메일·전화·날짜) + [처리 완료] 버튼.
3. [처리 완료] 클릭 → 배너에서 사라짐(0건이면 배너 미표시).
4. `/admin` 재방문 → 카드 사라짐(0건).
5. psql 확인: `select processed from email_requests;` → true.
6. 콘솔 에러 0.
7. cleanup: `delete from email_requests;`

- [ ] **Step 6: Commit**

```bash
git add src/components/EmailRequestBanner.tsx "src/app/[locale]/admin/(protected)/attendees/page.tsx" "src/app/[locale]/admin/(protected)/page.tsx"
git commit -m "feat(admin): 이메일 신청 배너 + 대시보드 대기 건수 카드

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 배포 메모 (계획 범위 밖, 병합 후)

- 프로덕션 Supabase에 0015 마이그레이션을 **코드 배포보다 먼저** 적용(`supabase db push --linked`) — 안 하면 신청 INSERT·관리자 배너 쿼리가 실패.
- main 병합·push 시 Vercel 자동 배포.
