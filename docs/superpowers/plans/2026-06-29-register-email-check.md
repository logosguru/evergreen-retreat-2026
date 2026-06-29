# 등록 이메일 중복 확인 단계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공개 등록을 "이메일 먼저 단계"로 나눠, 이미 등록된 이메일이면 새 등록을 막고 `/edit`로 안내한다.

**Architecture:** anon은 RLS상 `attendees`를 SELECT할 수 없으므로, 존재 여부(boolean)만 돌려주는 `SECURITY DEFINER` 함수 `email_registered(text)`를 추가한다. 서버 액션 `checkEmail`이 이를 호출하고, `RegistrationForm`은 phase("email"→"form") 상태로 1단계 이메일 확인 후 폼을 노출한다. `insertRegistration`에도 방어적 재확인을 넣는다.

**Tech Stack:** Next.js 16(App Router) · Supabase(@supabase/ssr, `rpc`) · next-intl v4 · TypeScript

## Global Constraints

- **Next.js 16**: 새 라우트 없음. 서버 액션은 `"use server"`. 클라이언트 네비게이션은 `@/i18n/navigation`의 `Link`.
- **Supabase**: 서버 클라이언트는 `@/lib/supabase/server`의 `createClient()`(async). anon/publishable 키 사용 → RLS 적용. 명단 비노출 유지(anon은 `attendees` SELECT 불가).
- **명단 비노출**: 이메일 확인은 **boolean만** 반환하는 `SECURITY DEFINER` 함수로만. 행 데이터를 클라이언트로 보내지 않는다.
- **이메일**: 가구주(head) 행에만 저장됨. 대소문자 무시(`lower(email)`), 기존 `attendees_email_idx`(lower(email)) 활용.
- **i18n**: `useTranslations`/`getTranslations`는 컴포넌트 상단에서. ko/en 키 파리티 필수. 폼 에러는 `t(error)` 패턴(에러 문자열 = 메시지 키).
- **datetime/타임존**: 기존 `toTimestamp` wall-clock 보존 로직 변경 금지.
- **검증 도구**(단위 테스트 러너 없음): `npx tsc --noEmit`, `npm run lint`, `npm run build`, `supabase db reset` + `docker exec -i supabase_db_retreat2026 psql -U postgres -d postgres`(RLS/RPC), `npm run dev` + 브라우저.
- **커밋 메시지** 말미: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- 작업 브랜치: `register-email-check` (이미 생성됨).

---

### Task 1: 마이그레이션 — `email_registered()` RPC

**Files:**
- Create: `supabase/migrations/0005_email_check.sql`

**Interfaces:**
- Produces: `public.email_registered(check_email text) returns boolean` (SECURITY DEFINER, anon/authenticated 실행 허용). 입력 이메일이 `attendees.email`에 (대소문자 무시) 존재하면 true.

- [ ] **Step 1: 마이그레이션 작성**

Create `supabase/migrations/0005_email_check.sql`:
```sql
-- =====================================================================
-- 등록 이메일 중복 확인: 존재 여부(boolean)만 반환(명단 비노출 유지)
-- =====================================================================
create or replace function public.email_registered(check_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.attendees
    where email is not null and lower(email) = lower(check_email)
  );
$$;

grant execute on function public.email_registered(text) to anon, authenticated;
```

- [ ] **Step 2: 마이그레이션 적용**

Run: `supabase db reset`
Expected: 0001~0005 오류 없이 적용, `Finished supabase db reset`.

- [ ] **Step 3: 함수 동작 + 명단 비노출 확인**

Run (트랜잭션 내 테스트 후 롤백):
```bash
docker exec -i supabase_db_retreat2026 psql -U postgres -d postgres <<'SQL'
begin;
insert into public.attendees (korean_name, is_householder, email)
  values ('홍길동', true, 'Test@Example.com');
set local role anon;
select 'exact:' , public.email_registered('test@example.com');   -- t (대소문자 무시)
select 'absent:', public.email_registered('nobody@x.com');        -- f
do $$ begin
  perform 1 from public.attendees limit 1;
  raise exception 'RLS FAIL: anon read attendees';
exception when insufficient_privilege then raise notice 'OK: anon cannot SELECT attendees';
end $$;
reset role;
rollback;
SQL
```
Expected:
- `exact: | t`
- `absent: | f`
- `NOTICE: OK: anon cannot SELECT attendees`
- 롤백되어 데이터 미잔존.

> 참고: anon이 `select * from attendees`를 직접 실행하면 RLS로 **0행**이 반환된다(에러가 아니라 빈 결과). 위 `do` 블록은 권한 오류가 아닐 수 있으므로, 핵심 검증은 "함수는 true/false를 주지만 함수 밖 직접 조회로는 행을 얻지 못한다"이다. 직접 확인하려면 `set local role anon; select count(*) from public.attendees;` → `0`을 별도로 확인한다.

- [ ] **Step 3b: anon 직접 조회는 0행 확인**

Run:
```bash
docker exec -i supabase_db_retreat2026 psql -U postgres -d postgres <<'SQL'
begin;
insert into public.attendees (korean_name, is_householder, email) values ('홍길동', true, 'a@b.com');
set local role anon;
select 'rpc:', public.email_registered('a@b.com');   -- t
select 'rows:', count(*) from public.attendees;       -- 0 (RLS)
reset role;
rollback;
SQL
```
Expected: `rpc: | t` 와 `rows: | 0`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0005_email_check.sql
git commit -m "$(cat <<'EOF'
feat: email_registered() SECURITY DEFINER RPC (등록 이메일 중복 확인)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 서버 액션 — `checkEmail` + `insertRegistration` 방어 재확인

**Files:**
- Modify: `src/app/[locale]/register/actions.ts`

**Interfaces:**
- Consumes: `email_registered(text)` RPC (Task 1).
- Produces:
  - `checkEmail(emailRaw: string): Promise<{ ok: true; registered: boolean } | { ok: false; error: string }>` — error는 `"validationEmail"` 또는 `"error"`.
  - `insertRegistration`는 기존 시그니처 유지하되, 이미 등록된 이메일이면 `{ ok: false, error: "alreadyRegistered" }` 반환 추가.

- [ ] **Step 1: `checkEmail` 액션 추가**

`src/app/[locale]/register/actions.ts` 파일 끝에 추가:
```ts
export type CheckEmailResult =
  | { ok: true; registered: boolean }
  | { ok: false; error: string };

// 이메일 형식 검증 후, 명단 비노출 RPC로 등록 여부(boolean)만 확인한다.
export async function checkEmail(emailRaw: string): Promise<CheckEmailResult> {
  const email = clean(emailRaw);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "validationEmail" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("email_registered", {
    check_email: email,
  });
  if (error) return { ok: false, error: "error" };
  return { ok: true, registered: !!data };
}
```

- [ ] **Step 2: `insertRegistration`에 방어적 재확인 추가**

`insertRegistration` 안에서, 이메일 형식 검증 블록(아래) 바로 다음에 RPC 재확인을 삽입한다.

기존:
```ts
  const email = clean(payload.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "validationEmail" };
  }

  const headErr = validatePerson(payload.householder);
```
변경:
```ts
  const email = clean(payload.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "validationEmail" };
  }

  const supabaseCheck = await createClient();
  const { data: already } = await supabaseCheck.rpc("email_registered", {
    check_email: email,
  });
  if (already) {
    return { ok: false, error: "alreadyRegistered" };
  }

  const headErr = validatePerson(payload.householder);
```

> 주의: 함수 하단에서 이미 `const supabase = await createClient();`를 만들어 insert에 쓰고 있다. 위 재확인용 클라이언트는 별도 이름(`supabaseCheck`)으로 추가하면 기존 코드와 충돌하지 않는다. (둘 다 동일한 anon 클라이언트라 무방.)

- [ ] **Step 3: 타입체크 + 린트**

Run: `npx tsc --noEmit && npm run lint`
Expected: 오류 없음. (이 시점에 Task 1 마이그레이션이 적용돼 있어야 `rpc("email_registered")` 호출이 런타임에 동작하지만, tsc/lint는 마이그레이션과 무관하게 통과한다.)

- [ ] **Step 4: 액션 RPC 연동 스모크(선택, dev 서버)**

`npm run dev` 실행 중이면, 임시 스크립트 없이 Task 4의 브라우저 검증에서 함께 확인한다. 별도 단위 테스트 러너는 없다.

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/register/actions.ts"
git commit -m "$(cat <<'EOF'
feat: checkEmail 서버 액션 + insertRegistration 중복 이메일 방어

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: i18n — `Register` 네임스페이스 키 추가

**Files:**
- Modify: `messages/ko.json`
- Modify: `messages/en.json`

**Interfaces:**
- Produces: `Register` 네임스페이스에 신규 키 `emailStepTitle`, `emailStepHint`, `next`, `checking`, `alreadyTitle`, `alreadyHint`, `goToEdit`, `useAnotherEmail`, `changeEmail`, `emailReadonlyNote`, `alreadyRegistered`.

- [ ] **Step 1: `messages/ko.json`의 `Register` 객체에 키 추가**

`Register` 객체 안, 기존 `"validationPartial": ...` 항목 **뒤**(마지막 키)에 콤마 추가 후 삽입:
```json
    "emailStepTitle": "이메일 확인",
    "emailStepHint": "먼저 이메일을 입력해 주세요. 이미 등록하셨다면 등록 정보를 수정할 수 있습니다.",
    "next": "다음",
    "checking": "확인 중…",
    "alreadyTitle": "이미 등록된 이메일입니다",
    "alreadyHint": "이 이메일로 이미 등록하셨습니다. 등록 정보를 수정하시려면 아래로 이동하세요.",
    "goToEdit": "내 등록 수정하러 가기",
    "useAnotherEmail": "다른 이메일로 등록",
    "changeEmail": "이메일 변경",
    "emailReadonlyNote": "이 이메일로 등록합니다",
    "alreadyRegistered": "이미 등록된 이메일입니다. ‘내 등록 수정’에서 정보를 변경해 주세요."
```

- [ ] **Step 2: `messages/en.json`의 `Register` 객체에 동일 키 추가**

```json
    "emailStepTitle": "Check your email",
    "emailStepHint": "Enter your email first. If you have already registered, you can edit your registration.",
    "next": "Next",
    "checking": "Checking…",
    "alreadyTitle": "This email is already registered",
    "alreadyHint": "You have already registered with this email. To update your registration, continue below.",
    "goToEdit": "Edit my registration",
    "useAnotherEmail": "Use a different email",
    "changeEmail": "Change email",
    "emailReadonlyNote": "Registering with this email",
    "alreadyRegistered": "This email is already registered. Please update your info under ‘Edit my registration’."
```

- [ ] **Step 3: JSON 유효성 + ko/en 키 파리티 확인**

Run:
```bash
node -e '
const ko=require("./messages/ko.json"), en=require("./messages/en.json");
const keys=o=>Object.entries(o).flatMap(([k,v])=>typeof v==="object"&&v?Object.keys(v).map(x=>k+"."+x):[k]);
const a=new Set(keys(ko)), b=new Set(keys(en));
const onlyKo=[...a].filter(x=>!b.has(x)), onlyEn=[...b].filter(x=>!a.has(x));
if(onlyKo.length||onlyEn.length){console.error("MISMATCH",{onlyKo,onlyEn});process.exit(1);}
console.log("OK keys match:",a.size);
'
```
Expected: `OK keys match: <N>` (불일치 시 실패).

- [ ] **Step 4: Commit**

```bash
git add messages/ko.json messages/en.json
git commit -m "$(cat <<'EOF'
feat(i18n): 등록 이메일 확인 단계 메시지(Register)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `RegistrationForm` 2단계화

**Files:**
- Modify: `src/components/RegistrationForm.tsx` (전체 교체)

**Interfaces:**
- Consumes: `checkEmail`(Task 2), `Register` i18n 키(Task 3), `@/i18n/navigation`의 `Link`.
- Produces: 없음(말단 UI).

- [ ] **Step 1: `RegistrationForm.tsx` 전체 교체**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PersonFields, emptyPerson } from "./PersonFields";
import {
  insertRegistration,
  checkEmail,
  type PersonInput,
  type RegistrationPayload,
} from "@/app/[locale]/register/actions";

const labelClass = "block text-sm font-medium text-slate-700";
const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

export function RegistrationForm() {
  const t = useTranslations("Register");
  const tc = useTranslations("Common");
  const tf = useTranslations("Fields");

  const [phase, setPhase] = useState<"email" | "form">("email");
  const [mode, setMode] = useState<"individual" | "household">("individual");
  const [email, setEmail] = useState("");
  const [householder, setHouseholder] = useState<PersonInput>(emptyPerson());
  const [members, setMembers] = useState<PersonInput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  // 1단계: 이메일 확인
  const [emailError, setEmailError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const [checking, startCheck] = useTransition();

  function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailError(null);
    setRegistered(false);
    startCheck(async () => {
      const res = await checkEmail(email);
      if (!res.ok) {
        setEmailError(res.error);
        return;
      }
      if (res.registered) {
        setRegistered(true);
        return;
      }
      setPhase("form");
    });
  }

  function patchHouseholder(patch: Partial<PersonInput>) {
    setHouseholder((prev) => ({ ...prev, ...patch }));
  }

  function patchMember(index: number, patch: Partial<PersonInput>) {
    setMembers((prev) =>
      prev.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    );
  }

  function addMember() {
    setMembers((prev) => [...prev, emptyPerson()]);
  }

  function removeMember(index: number) {
    setMembers((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload: RegistrationPayload = {
      mode,
      email,
      householder,
      members: mode === "household" ? members : [],
    };
    startTransition(async () => {
      const result = await insertRegistration(payload);
      if (result.ok) {
        setDone(true);
      } else {
        setError(result.error);
      }
    });
  }

  if (done) {
    return (
      <div className="rounded-xl bg-emerald-50 p-6 ring-1 ring-emerald-200">
        <p className="text-lg font-semibold text-emerald-800">{t("success")}</p>
        <p className="mt-2 text-sm text-emerald-700">{t("successEditHint")}</p>
      </div>
    );
  }

  // ── 1단계: 이메일 확인 ──
  if (phase === "email") {
    return (
      <form onSubmit={submitEmail} className="space-y-4">
        <div>
          <label className={labelClass}>
            {tf("email")} <span className="text-rose-500">*</span>
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setRegistered(false);
              setEmailError(null);
            }}
            className={inputClass}
            placeholder="you@example.com"
          />
          <p className="mt-1 text-xs text-slate-500">{t("emailStepHint")}</p>
        </div>

        {emailError && (
          <p className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
            {t(emailError)}
          </p>
        )}

        {registered ? (
          <div className="rounded-xl bg-amber-50 p-5 ring-1 ring-amber-200">
            <p className="text-base font-semibold text-amber-900">
              {t("alreadyTitle")}
            </p>
            <p className="mt-1 text-sm text-amber-800">{t("alreadyHint")}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link
                href="/edit"
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                {t("goToEdit")}
              </Link>
              <button
                type="button"
                onClick={() => {
                  setRegistered(false);
                  setEmail("");
                }}
                className="text-sm font-medium text-slate-500 hover:text-slate-700"
              >
                {t("useAnotherEmail")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="submit"
            disabled={checking}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
          >
            {checking ? t("checking") : t("next")}
          </button>
        )}
      </form>
    );
  }

  // ── 2단계: 등록 폼 ──
  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* 확인된 이메일 (읽기전용) */}
      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
        <div>
          <p className="text-xs text-slate-500">{t("emailReadonlyNote")}</p>
          <p className="text-sm font-medium text-slate-800">{email}</p>
        </div>
        <button
          type="button"
          onClick={() => setPhase("email")}
          className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
        >
          {t("changeEmail")}
        </button>
      </div>

      {/* 등록 방식 선택 */}
      <fieldset>
        <legend className={labelClass}>{t("mode")}</legend>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="mode"
              checked={mode === "individual"}
              onChange={() => setMode("individual")}
            />
            {t("modeIndividual")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="mode"
              checked={mode === "household"}
              onChange={() => setMode("household")}
            />
            {t("modeHousehold")}
          </label>
        </div>
      </fieldset>

      {/* 가구주 / 개인 */}
      <section className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="mb-4 text-base font-semibold text-slate-900">
          {mode === "household" ? t("householderSection") : t("modeIndividual")}
        </h2>
        <PersonFields
          value={householder}
          onChange={patchHouseholder}
          groupId="householder"
          showContact
        />
      </section>

      {/* 가족 구성원 (household 모드) */}
      {mode === "household" && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-slate-900">
            {t("familySection")}
          </h2>
          {members.map((m, i) => (
            <div
              key={i}
              className="rounded-xl bg-white p-5 ring-1 ring-slate-200"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500">
                  #{i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeMember(i)}
                  className="text-sm font-medium text-rose-600 hover:text-rose-700"
                >
                  {t("removeMember")}
                </button>
              </div>
              <PersonFields
                value={m}
                onChange={(patch) => patchMember(i, patch)}
                groupId={`member-${i}`}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={addMember}
            className="rounded-lg border border-dashed border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            + {t("addMember")}
          </button>
        </section>
      )}

      {error && (
        <p className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {t(error)}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? tc("submitting") : tc("submit")}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: 타입체크 + 린트**

Run: `npx tsc --noEmit && npm run lint`
Expected: 오류 없음.

- [ ] **Step 3: 빌드**

Run: `npm run build`
Expected: 성공(`/[locale]/register` 컴파일 포함).

- [ ] **Step 4: 브라우저 스모크 (dev 서버 + 로컬 DB)**

`supabase db reset` 후 `npm run dev`. 로컬 DB에 등록 행이 없다면 먼저 하나 만든다(또는 `/register`로 새 이메일 등록 1건 수행). 그다음:
- `http://localhost:3000/register` → 1단계 이메일 입력 화면만 보임.
- **새 이메일** 입력 → "다음" → 2단계 폼 노출, 상단에 그 이메일이 읽기전용으로 표시. "이메일 변경" → 1단계 복귀. 폼 작성 → 제출 → 성공 화면. (DB에 행 생성 확인: `docker exec ... psql -c "select email,is_householder from attendees where email is not null;"`)
- **방금 등록한 이메일** 다시 입력 → "다음" → "이미 등록된 이메일입니다" 카드 + [내 등록 수정하러 가기](`/edit`로 이동) + [다른 이메일로 등록](카드 닫힘·입력 초기화).
- 형식 오류 이메일(`abc`) → `validationEmail` 메시지.
- `/en/register`에서 영어 라벨.

- [ ] **Step 5: Commit**

```bash
git add src/components/RegistrationForm.tsx
git commit -m "$(cat <<'EOF'
feat: 등록 폼 2단계화 — 이메일 먼저 확인(중복 차단/수정 안내)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Spec coverage:**
- `email_registered` RPC(SECURITY DEFINER, 명단 비노출) → Task 1 ✅
- `checkEmail` 서버 액션 → Task 2 ✅
- `insertRegistration` 방어적 재확인(`alreadyRegistered`) → Task 2 ✅
- 2단계 UI(이메일 먼저 / 차단 카드+/edit / 미등록→폼 / 이메일 읽기전용+변경) → Task 4 ✅
- i18n 키(ko/en, 파리티) → Task 3 ✅
- 검증(RPC psql + 명단 비노출, tsc/lint/build, 브라우저, 키 파리티) → Task 1·3·4 ✅
- 범위 밖(Turnstile, 레이트리밋, 이메일 공유 케이스) → 미구현(의도) ✅

**2. Placeholder scan:** 없음. 모든 코드 스텝에 완전한 코드. ("TODO(Phase1...)" 주석은 기존 코드의 Turnstile 표시로, 본 작업이 새로 추가하는 게 아님 — actions.ts 기존 라인.)

**3. Type consistency:** `checkEmail` 반환형(`{ ok, registered } | { ok, error }`)이 Task 2 정의와 Task 4 사용처 일치. 에러 키(`validationEmail`/`error`/`alreadyRegistered`)가 i18n(Task 3)·폼 `t(error)`/`t(emailError)` 사용과 일치. RPC 인자명 `check_email`이 마이그레이션(Task 1)·액션(Task 2) 일치. `email_registered` 함수명 일관.
