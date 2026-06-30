# 배포 준비 코드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 출시 전 코드 준비 — 공개 폼에 Cloudflare Turnstile 적용, Supabase keep-alive cron, 배포 설정 파일 정비.

**Architecture:** 서버 검증 헬퍼(`verifyTurnstile`)를 두 공개 서버 액션(`insertRegistration`, 신설 `requestEditMagicLink`) 진입부에서 호출. 클라이언트는 `TurnstileWidget`으로 토큰 획득. keep-alive는 Vercel Cron이 `/api/keep-alive` 라우트를 호출해 공개읽기 테이블을 가볍게 쿼리.

**Tech Stack:** Next.js 16 (App Router, proxy.ts), next-intl v4, Supabase(@supabase/ssr), Cloudflare Turnstile, Vercel Cron.

## Global Constraints

- 키 미설정 시 Turnstile 검증 스킵(`true`), 키 있는데 토큰 없음/siteverify 실패/네트워크 오류 → 차단(`false`, fail-closed). (verbatim from spec)
- 시크릿은 절대 `NEXT_PUBLIC_` 접두사 금지. 클라 키만 `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
- DB enum/표시 문자열은 messages로 번역. 새 에러는 메시지 키로 반환하고 폼에서 `t(key)`로 표시.
- 서버 액션으로 폼 mutation, Route Handler는 cron만. 인증/`api` 라우트는 `[locale]` 밖 + proxy matcher 제외(이미 충족).
- **검증 방식**: 이 저장소는 단위 테스트 하니스가 없다. 각 태스크는 `npx tsc --noEmit` + `npm run lint`(+ 필요 시 `npm run build`)로 검증하고, 마지막 태스크에서 Playwright MCP 브라우저 E2E로 플로우를 확인한다. (spec 결정사항)
- 커밋 메시지 말미: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 1: Turnstile 서버 검증 헬퍼

**Files:**
- Create: `src/lib/turnstile.ts`

**Interfaces:**
- Produces: `verifyTurnstile(token: string | null): Promise<boolean>`

- [ ] **Step 1: 헬퍼 작성**

`src/lib/turnstile.ts`:

```ts
// Cloudflare Turnstile 서버 검증.
// TURNSTILE_SECRET_KEY 미설정 시 스킵(true) — 로컬/테스트 친화.
// 키가 있으면 토큰 없음/siteverify 실패/네트워크 오류 모두 차단(false, fail-closed).
const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(token: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // 키 미설정 → 스킵
  if (!token) return false; // 키 있는데 토큰 없음 → 차단

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false; // 네트워크/파싱 오류 → fail-closed
  }
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add src/lib/turnstile.ts
git commit -m "feat(turnstile): 서버 siteverify 검증 헬퍼 추가"
```

---

### Task 2: Turnstile 클라이언트 위젯

**Files:**
- Create: `src/components/TurnstileWidget.tsx`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` env.
- Produces: `<TurnstileWidget onVerify={(token: string) => void} onExpire?={() => void} locale?={string} />` — 사이트 키 없으면 `null` 렌더.

- [ ] **Step 1: 위젯 작성**

`src/components/TurnstileWidget.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
      language?: string;
      theme?: "auto" | "light" | "dark";
    },
  ) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

function ensureScript(): void {
  if (document.querySelector(`script[src="${SCRIPT_SRC}"]`)) return;
  const s = document.createElement("script");
  s.src = SCRIPT_SRC;
  s.async = true;
  s.defer = true;
  document.head.appendChild(s);
}

export function TurnstileWidget({
  onVerify,
  onExpire,
  locale,
}: {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  locale?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  // 콜백을 ref에 보관해 effect 재실행 없이 최신 함수 사용(react-best-practices).
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  onVerifyRef.current = onVerify;
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!SITE_KEY) return; // 키 없으면 렌더 안 함
    ensureScript();
    let cancelled = false;
    const timer = window.setInterval(() => {
      if (
        cancelled ||
        !window.turnstile ||
        !ref.current ||
        widgetId.current !== null
      ) {
        return;
      }
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: SITE_KEY,
        language: locale,
        callback: (t) => onVerifyRef.current(t),
        "expired-callback": () => onExpireRef.current?.(),
        "error-callback": () => onExpireRef.current?.(),
      });
      window.clearInterval(timer);
    }, 200);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [locale]);

  if (!SITE_KEY) return null;
  return <div ref={ref} className="mt-2" />;
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add src/components/TurnstileWidget.tsx
git commit -m "feat(turnstile): 클라이언트 위젯 컴포넌트 추가(키 없으면 미표시)"
```

---

### Task 3: 등록 폼 보호 (insertRegistration + RegistrationForm + messages)

**Files:**
- Modify: `src/app/[locale]/register/actions.ts` (insertRegistration 시그니처 + 검증)
- Modify: `src/components/RegistrationForm.tsx` (위젯 + 토큰)
- Modify: `messages/ko.json`, `messages/en.json`, `messages/es.json` (Register.captchaFailed)

**Interfaces:**
- Consumes: `verifyTurnstile` (Task 1), `TurnstileWidget` (Task 2).
- Produces: `insertRegistration(payload: RegistrationPayload, turnstileToken: string | null): Promise<RegistrationResult>`

- [ ] **Step 1: 서버 액션에 검증 추가**

`src/app/[locale]/register/actions.ts` 상단 import에 추가:

```ts
import { verifyTurnstile } from "@/lib/turnstile";
```

`insertRegistration`의 시그니처와 진입부를 다음으로 교체 (기존 `// TODO(Phase1 출시 전): ...` 줄 삭제):

```ts
export async function insertRegistration(
  payload: RegistrationPayload,
  turnstileToken: string | null,
): Promise<RegistrationResult> {
  if (!(await verifyTurnstile(turnstileToken))) {
    return { ok: false, error: "captchaFailed" };
  }
  const email = clean(payload.email);
```

(이후 본문은 그대로 유지.)

- [ ] **Step 2: RegistrationForm에 위젯/토큰 추가**

`src/components/RegistrationForm.tsx`:

import 블록에 추가:

```tsx
import { useLocale } from "next-intl";
import { TurnstileWidget } from "./TurnstileWidget";
```

컴포넌트 본문 상단(`const t = useTranslations("Register");` 부근)에 추가:

```tsx
  const locale = useLocale();
  const [token, setToken] = useState<string | null>(null);
  const needsCaptcha = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
```

`handleSubmit`의 `insertRegistration(payload)` 호출을 토큰 전달로 교체:

```tsx
      const result = await insertRegistration(payload, token);
```

2단계 폼의 제출 버튼 **바로 앞**(`{error && (...)}` 다음, `<button type="submit" ...>` 앞)에 위젯 추가:

```tsx
      <TurnstileWidget
        onVerify={setToken}
        onExpire={() => setToken(null)}
        locale={locale}
      />
```

제출 버튼의 `disabled`를 토큰 요구로 보강:

```tsx
        disabled={pending || (needsCaptcha && !token)}
```

- [ ] **Step 3: 메시지 키 추가**

`messages/ko.json`의 `"Register"` 객체에 추가:

```json
    "captchaFailed": "사람인지 확인하는 절차를 완료해 주세요."
```

`messages/en.json`의 `"Register"` 객체에 추가:

```json
    "captchaFailed": "Please complete the verification to confirm you're human."
```

`messages/es.json`의 `"Register"` 객체에 추가:

```json
    "captchaFailed": "Complete la verificación para confirmar que es una persona."
```

> 주의: 추가하는 줄 앞 항목 끝에 콤마가 있는지 확인(JSON 문법). 각 파일 `npx tsc` 전에 `node -e "require('./messages/ko.json')"` 등으로 파싱 확인 가능.

- [ ] **Step 4: 타입체크 + 린트**

Run: `npx tsc --noEmit && npm run lint`
Expected: 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add src/app/\[locale\]/register/actions.ts src/components/RegistrationForm.tsx messages/ko.json messages/en.json messages/es.json
git commit -m "feat(turnstile): 등록 폼 제출에 Turnstile 검증 적용"
```

---

### Task 4: 수정 링크 폼 보호 (requestEditMagicLink + EditRequestForm + messages)

**Files:**
- Modify: `src/app/[locale]/edit/actions.ts` (requestEditMagicLink 신설)
- Modify: `src/components/EditRequestForm.tsx` (서버 액션 + 위젯)
- Modify: `messages/ko.json`, `messages/en.json`, `messages/es.json` (Edit.captchaFailed/sendError/validationEmail)

**Interfaces:**
- Consumes: `verifyTurnstile` (Task 1), `TurnstileWidget` (Task 2).
- Produces: `requestEditMagicLink(params: { email: string; turnstileToken: string | null; origin: string }): Promise<{ ok: true } | { ok: false; error: string }>`

- [ ] **Step 1: 서버 액션 신설**

`src/app/[locale]/edit/actions.ts` 상단 import에 추가:

```ts
import { verifyTurnstile } from "@/lib/turnstile";
```

파일 끝에 추가:

```ts
export type RequestLinkResult = { ok: true } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 매직링크 발송을 서버에서 처리해 Turnstile 서버 검증을 강제한다.
// emailRedirectTo의 origin은 클라이언트가 전달(Supabase Redirect 허용목록이 최종 검증).
export async function requestEditMagicLink(params: {
  email: string;
  turnstileToken: string | null;
  origin: string;
}): Promise<RequestLinkResult> {
  if (!(await verifyTurnstile(params.turnstileToken))) {
    return { ok: false, error: "captchaFailed" };
  }
  const email = clean(params.email);
  if (!email || !EMAIL_RE.test(email)) {
    return { ok: false, error: "validationEmail" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${params.origin}/auth/confirm?next=/edit/manage`,
    },
  });
  if (error) return { ok: false, error: "sendError" };
  return { ok: true };
}
```

- [ ] **Step 2: EditRequestForm 교체**

`src/components/EditRequestForm.tsx` 전체를 다음으로 교체:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { TurnstileWidget } from "./TurnstileWidget";
import { requestEditMagicLink } from "@/app/[locale]/edit/actions";

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

export function EditRequestForm() {
  const t = useTranslations("Edit");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const needsCaptcha = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await requestEditMagicLink({
        email,
        turnstileToken: token,
        origin: window.location.origin,
      });
      if (res.ok) setSent(true);
      else setError(res.error);
    });
  }

  if (sent) {
    return (
      <div className="rounded-xl bg-emerald-50 p-6 ring-1 ring-emerald-200">
        <p className="text-sm font-medium text-emerald-800">{t("linkSent")}</p>
        <p className="mt-2 text-xs text-emerald-700">{t("linkSentNote")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700">
          {t("emailLabel")}
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
          placeholder="you@example.com"
        />
      </div>
      <TurnstileWidget
        onVerify={setToken}
        onExpire={() => setToken(null)}
        locale={locale}
      />
      {error && (
        <p className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {t(error)}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || (needsCaptcha && !token)}
        className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? t("sending") : t("sendLink")}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: 메시지 키 추가**

`messages/ko.json`의 `"Edit"` 객체에 추가:

```json
    "captchaFailed": "사람인지 확인하는 절차를 완료해 주세요.",
    "sendError": "링크 발송 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    "validationEmail": "올바른 이메일 주소를 입력해 주세요."
```

`messages/en.json`의 `"Edit"` 객체에 추가:

```json
    "captchaFailed": "Please complete the verification to confirm you're human.",
    "sendError": "Something went wrong sending the link. Please try again shortly.",
    "validationEmail": "Please enter a valid email address."
```

`messages/es.json`의 `"Edit"` 객체에 추가:

```json
    "captchaFailed": "Complete la verificación para confirmar que es una persona.",
    "sendError": "Hubo un problema al enviar el enlace. Inténtelo de nuevo en unos momentos.",
    "validationEmail": "Introduzca una dirección de correo válida."
```

> 주의: 마지막 키가 아니면 끝에 콤마, 마지막 키면 콤마 없음 — 삽입 위치의 기존 끝 항목 콤마 처리에 유의.

- [ ] **Step 4: 타입체크 + 린트**

Run: `npx tsc --noEmit && npm run lint`
Expected: 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add src/app/\[locale\]/edit/actions.ts src/components/EditRequestForm.tsx messages/ko.json messages/en.json messages/es.json
git commit -m "feat(turnstile): 수정 링크 요청을 서버 액션화 + Turnstile 검증"
```

---

### Task 5: keep-alive 라우트 + vercel.json

**Files:**
- Create: `src/app/api/keep-alive/route.ts`
- Create: `vercel.json`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`, `CRON_SECRET` env.
- Produces: `GET /api/keep-alive` → 200 `{ ok: true }` 또는 401/500.

- [ ] **Step 1: 라우트 작성**

`src/app/api/keep-alive/route.ts`:

```ts
import { createClient } from "@/lib/supabase/server";

// Supabase 무료 티어 7일 무활동 정지 방지용 keep-alive.
// Vercel Cron은 CRON_SECRET 설정 시 Authorization: Bearer 헤더를 자동 전송한다.
// 공개읽기(RLS) 테이블 faqs를 가볍게 head-count 하여 DB 활동을 발생시킨다.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("faqs")
    .select("id", { head: true, count: "exact" });

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
```

- [ ] **Step 2: vercel.json 작성**

`vercel.json`:

```json
{
  "crons": [
    { "path": "/api/keep-alive", "schedule": "0 6 * * *" }
  ]
}
```

- [ ] **Step 3: 빌드 검증**

Run: `npx tsc --noEmit && npm run build`
Expected: 빌드 성공, `/api/keep-alive` 라우트가 출력에 포함.

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/keep-alive/route.ts vercel.json
git commit -m "feat(cron): Supabase keep-alive 라우트 + Vercel Cron(매일) 설정"
```

---

### Task 6: 배포 설정 문서 + 전체 검증 + 브라우저 E2E

**Files:**
- Modify: `.env.example`
- Modify: `SETUP.md`

- [ ] **Step 1: `.env.example`에 새 변수 추가**

`.env.example` 끝에 추가:

```
# Cloudflare Turnstile — 공개 폼 봇 방지 (Cloudflare 대시보드 → Turnstile)
# 미설정 시 검증 스킵(로컬). 두 키는 함께 설정.
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=

# Vercel Cron keep-alive 보호용 시크릿 (임의 문자열)
CRON_SECRET=
```

- [ ] **Step 2: `SETUP.md`에 섹션 추가**

`SETUP.md`의 "## 5. Vercel 배포" 섹션 바로 앞에 다음 섹션을 삽입:

```markdown
## 4b. Cloudflare Turnstile (공개 폼 봇 방지) — 출시 전 권장

1. https://dash.cloudflare.com → Turnstile → 사이트 추가(도메인: 배포 URL, 로컬 테스트 시 `localhost` 추가).
2. 발급된 **Site Key / Secret Key**를 환경변수로 등록:
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (Site Key)
   - `TURNSTILE_SECRET_KEY` (Secret Key)
3. 두 키가 모두 비어 있으면 검증을 스킵하므로 로컬 개발은 키 없이 동작한다.
   키가 설정되면 등록 제출과 수정 링크 요청에 캡차가 강제된다.

## 4c. keep-alive cron

- `vercel.json`의 cron이 매일 `/api/keep-alive`를 호출해 DB 무활동 정지를 방지한다.
- Vercel 프로젝트 환경변수에 `CRON_SECRET`(임의 문자열)을 등록하면 라우트가
  `Authorization: Bearer <CRON_SECRET>` 헤더를 검증한다(Vercel Cron이 자동 전송).
```

또한 "## 5. Vercel 배포"의 env 추가 명령 목록에 다음을 덧붙인다:

```bash
vercel env add NEXT_PUBLIC_TURNSTILE_SITE_KEY
vercel env add TURNSTILE_SECRET_KEY
vercel env add CRON_SECRET
```

- [ ] **Step 3: 전체 검증**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 전부 통과.

- [ ] **Step 4: 브라우저 E2E (로컬, 키 없음 상태)**

전제: `supabase start` + `npm run dev` 실행 중. Playwright MCP로:
1. `http://localhost:3000/register` → 이메일 입력 → "다음" → 등록 폼 표시. (키 없으므로 Turnstile 위젯 미표시)
2. 개인 등록 정보 입력 → 제출 → 성공 메시지 확인.
3. `http://localhost:3000/edit` → 이메일 입력 → "수정 링크 받기" → linkSent 메시지 확인. Mailpit(54324)에 메일 도착 확인(선택).
4. 콘솔 에러 없음 확인.

Expected: 두 플로우 모두 키 없이 정상 동작.

- [ ] **Step 5: 커밋**

```bash
git add .env.example SETUP.md
git commit -m "docs(deploy): .env.example/SETUP.md에 Turnstile·CRON_SECRET·cron 안내 추가"
```

---

## Self-Review 메모

- **Spec 커버리지**: Part A(Turnstile) → Task 1·2·3·4 / Part B(keep-alive) → Task 5 / Part C(설정·검증) → Task 6. 모두 매핑됨.
- **타입 일관성**: `verifyTurnstile(token)`·`TurnstileWidget({onVerify,onExpire,locale})`·`insertRegistration(payload, token)`·`requestEditMagicLink({email,turnstileToken,origin})` 시그니처가 태스크 간 일치.
- **사용자(대시보드) 작업** — 코드 머지 후 안내: Cloudflare Turnstile 사이트 생성 + 키 발급, `CRON_SECRET` 생성, Vercel env 등록(위 3개 + 기존 Supabase 키).
