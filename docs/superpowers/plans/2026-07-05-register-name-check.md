# 등록 여부 이름 확인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 등록 1단계에 [이름으로 확인] 탭을 추가해, 이름(한글/영어 표기 무관)으로 기존 등록 여부와 마스킹된 가구 대표 이메일을 확인할 수 있게 한다.

**Architecture:** anon은 RLS상 `attendees`를 SELECT할 수 없으므로, 정규화(소문자+공백 제거) 정확 일치로 `korean_name`/`english_name`을 대조하고 **마스킹된 가구주 이메일 배열만** 반환하는 `SECURITY DEFINER` 함수 `name_registered(text)`를 추가한다(0005 `email_registered` 패턴). 서버 액션 `checkName`이 이를 호출하고, `RegistrationForm`의 phase "email" 화면을 탭 2개([이메일로 확인]/[이름으로 확인])로 확장한다. 이름 탭은 확인 전용 — phase "form" 전환은 이메일 탭에서만.

**Tech Stack:** Next.js 16(App Router) · Supabase(@supabase/ssr, `rpc`) · next-intl v4 · TypeScript · Tailwind v4

**Spec:** `docs/superpowers/specs/2026-07-05-register-name-check-design.md`

## Global Constraints

- **명단 비노출**: 이름 확인은 **마스킹된 이메일 배열만** 반환하는 `SECURITY DEFINER` 함수로만. 원본 이메일·행 데이터를 클라이언트로 보내지 않는다. **부분 일치 금지**(정확 일치만).
- **매칭 규칙**: `lower()` + 모든 공백 제거(`regexp_replace(x, '\s', '', 'g')`) 후 정확 일치. 양쪽(입력·저장값)에 동일 적용. 2자 미만(공백 제거 후)은 거부.
- **마스킹 규칙**: local 앞 2자 + `***@` + 도메인 앞 2자 + `***.` + 최상위 도메인. 예: `joeykim@gmail.com` → `jo***@gm***.com`.
- **가구주 역추적**: 일치자가 구성원(`email=null`)이면 `householder_id`로 head의 email 사용. head 본인이면 자기 email.
- **Supabase**: 서버 클라이언트는 `@/lib/supabase/server`의 `createClient()`(async, await 필수). RPC 호출 패턴은 기존 `checkEmail`과 동일.
- **i18n**: `useTranslations`는 컴포넌트 상단에서만. **ko/en/es 3개 파일 키 파리티 필수**. 에러 문자열 = 메시지 키(`t(error)` 패턴).
- **문구 규칙**: '교우' 금지 → '성도'. 스페인어 UI는 usted체.
- **검증 도구**(단위 테스트 러너 없음): `npx tsc --noEmit`, `npm run lint`, `npm run build`, `supabase db reset` + `docker exec -i supabase_db_retreat2026 psql -U postgres -d postgres`(RPC/RLS), `npm run dev` + 브라우저.
- **커밋 메시지** 말미: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- 작업 브랜치: `register-name-check` (Task 1 Step 0에서 생성).

---

### Task 1: 마이그레이션 — `mask_email()` + `name_registered()` RPC

**Files:**
- Create: `supabase/migrations/0013_name_check.sql`

**Interfaces:**
- Produces: `public.name_registered(check_name text) returns text[]` (SECURITY DEFINER, anon/authenticated 실행 허용). 정규화 정확 일치자들의 가구 대표 이메일을 마스킹·중복 제거해 배열로 반환, 빈 배열 = 미등록. `public.mask_email(addr text) returns text`(내부용 헬퍼).

- [ ] **Step 0: 브랜치 생성**

Run: `git checkout -b register-name-check`

- [ ] **Step 1: 마이그레이션 작성**

Create `supabase/migrations/0013_name_check.sql`:
```sql
-- =====================================================================
-- 등록 여부 이름 확인: 정규화 정확 일치 → 마스킹된 가구 대표 이메일 배열 반환
-- (명단 비노출 유지 — 원본 이메일·행 데이터는 반환하지 않음)
-- =====================================================================

-- 이메일 마스킹: joeykim@gmail.com → jo***@gm***.com
create or replace function public.mask_email(addr text)
returns text
language sql
immutable
as $$
  select left(split_part(addr, '@', 1), 2) || '***@'
      || left(split_part(addr, '@', 2), 2) || '***.'
      || regexp_replace(split_part(addr, '@', 2), '^.*\.', '');
$$;

-- 입력한 이름(공백 제거+소문자 정규화, 정확 일치)이 korean_name/english_name
-- 어느 쪽이든 일치하면, 일치자들의 가구 대표(head) 이메일을 마스킹·중복 제거해
-- 배열로 반환. 빈 배열 = 미등록. 2자 미만 입력은 빈 배열.
create or replace function public.name_registered(check_name text)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with norm as (
    select lower(regexp_replace(coalesce(check_name, ''), '\s', '', 'g')) as q
  ),
  matched as (
    select a.email, a.householder_id
    from public.attendees a, norm
    where length(norm.q) >= 2
      and (
        lower(regexp_replace(coalesce(a.korean_name,  ''), '\s', '', 'g')) = norm.q
        or
        lower(regexp_replace(coalesce(a.english_name, ''), '\s', '', 'g')) = norm.q
      )
  ),
  head_emails as (
    select distinct coalesce(h.email, m.email) as email
    from matched m
    left join public.attendees h on h.id = m.householder_id
  )
  select coalesce(array_agg(distinct public.mask_email(email)), '{}')
  from head_emails
  where email is not null;
$$;

grant execute on function public.name_registered(text) to anon, authenticated;
```

- [ ] **Step 2: 마이그레이션 적용**

Run: `supabase db reset` (로컬 Supabase가 꺼져 있으면 먼저 `supabase start`)
Expected: 0001~0013 오류 없이 적용, `Finished supabase db reset`.

- [ ] **Step 3: psql로 RPC 동작 검증**

Run:
```bash
docker exec -i supabase_db_retreat2026 psql -U postgres -d postgres <<'SQL'
-- seed: 가구주 2명(동명이인) + 구성원 1명(email 없음)
insert into public.attendees (id, korean_name, english_name, email, is_householder, householder_id) values
  ('00000000-0000-0000-0000-000000000001', '김철수', 'Chulsoo Kim', 'joeykim@gmail.com', true, null),
  ('00000000-0000-0000-0000-000000000002', '김영희', 'Younghee Kim', null, false, '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000003', '김철수', null, 'other@naver.com', true, null);

-- 1) head 한글 정확 일치 + 동명이인 2가구 → 마스킹 이메일 2개
select public.name_registered('김철수');
-- 2) 공백 섞인 입력 → 동일 결과
select public.name_registered('김 철수');
-- 3) 구성원 영어 이름(대소문자 다름) → 가구주 마스킹 이메일 1개
select public.name_registered('younghee kim');
-- 4) 미등록 이름 → {}
select public.name_registered('홍길동');
-- 5) 1글자 → {}
select public.name_registered('김');
-- 6) 마스킹 형식 + 1글자 local 에지
select public.mask_email('joeykim@gmail.com'), public.mask_email('a@b.co');
-- 7) anon: RPC 호출 가능, 테이블 직접 SELECT는 0행(RLS)
set role anon;
select public.name_registered('김철수');
select count(*) from public.attendees;
reset role;
-- cleanup
delete from public.attendees where id in (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003');
SQL
```
Expected:
1. `{jo***@gm***.com,ot***@na***.com}` (순서 무관, 2개)
2. 1과 동일
3. `{jo***@gm***.com}`
4. `{}`
5. `{}`
6. `jo***@gm***.com` / `a***@b***.co`
7. anon도 1과 동일한 배열 반환, `count` = **0** (RLS로 비노출)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0013_name_check.sql
git commit -m "feat(db): 이름으로 등록 여부 확인 RPC name_registered + mask_email

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 서버 액션 `checkName()`

**Files:**
- Modify: `src/app/[locale]/register/actions.ts` (파일 끝, `checkEmail` 아래에 추가)

**Interfaces:**
- Consumes: `public.name_registered(check_name text) returns text[]` (Task 1), `clean()` from `@/lib/attendee-rows`(이미 import됨), `createClient()` from `@/lib/supabase/server`(이미 import됨).
- Produces: `checkName(nameRaw: string): Promise<CheckNameResult>`, `type CheckNameResult = { ok: true; matched: boolean; maskedEmails: string[] } | { ok: false; error: string }`. 에러 키: `"validationCheckName"`(2자 미만), `"error"`(RPC 실패).

- [ ] **Step 1: 액션 추가**

`src/app/[locale]/register/actions.ts` 파일 끝(기존 `checkEmail` 함수 뒤)에 추가:
```ts
export type CheckNameResult =
  | { ok: true; matched: boolean; maskedEmails: string[] }
  | { ok: false; error: string };

// 이름(한글/영어 표기 무관)으로 등록 여부 확인. 정규화 정확 일치만 —
// 명단 비노출 RPC가 마스킹된 가구 대표 이메일 배열만 반환한다.
export async function checkName(nameRaw: string): Promise<CheckNameResult> {
  const name = clean(nameRaw);
  if (!name || name.replace(/\s/g, "").length < 2) {
    return { ok: false, error: "validationCheckName" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("name_registered", {
    check_name: name,
  });
  if (error) return { ok: false, error: "error" };
  const maskedEmails = (data ?? []) as string[];
  return { ok: true, matched: maskedEmails.length > 0, maskedEmails };
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 3: Commit**

```bash
git add src/app/[locale]/register/actions.ts
git commit -m "feat(register): checkName 서버 액션 — 이름으로 등록 여부 확인

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: i18n 키 추가 (ko/en/es)

**Files:**
- Modify: `messages/ko.json`, `messages/en.json`, `messages/es.json` — 각 파일의 `Register` 네임스페이스 (기존 `captchaFailed` 키 뒤에 추가)

**Interfaces:**
- Produces: `Register` 네임스페이스 키 11개 — `tabEmail`, `tabName`, `nameLabel`, `nameStepHint`, `checkName`, `nameFoundTitle`, `nameFoundHint`, `nameNotFoundTitle`, `nameNotFoundHint`, `goRegisterByEmail`, `validationCheckName`. (Task 4가 전부 사용.)

- [ ] **Step 1: ko.json**

`messages/ko.json`의 `Register` 네임스페이스, `"captchaFailed"` 항목 뒤에 추가:
```json
"tabEmail": "이메일로 확인",
"tabName": "이름으로 확인",
"nameLabel": "이름",
"nameStepHint": "등록 때 입력한 이름 그대로 적어 주세요 (한글·영어 어느 쪽이든 가능). 가족 등록에 포함된 분도 본인 이름으로 확인할 수 있습니다.",
"checkName": "확인하기",
"nameFoundTitle": "이미 등록되어 있습니다",
"nameFoundHint": "아래 이메일로 수정 링크를 받아 등록 내용을 확인·수정할 수 있습니다.",
"nameNotFoundTitle": "이 이름으로 등록된 내역이 없습니다",
"nameNotFoundHint": "아직 등록 전이라면 이메일 확인 후 새로 등록해 주세요.",
"goRegisterByEmail": "이메일로 새로 등록하기",
"validationCheckName": "이름을 2자 이상 입력해 주세요."
```

- [ ] **Step 2: en.json**

같은 위치에 추가:
```json
"tabEmail": "Check by Email",
"tabName": "Check by Name",
"nameLabel": "Name",
"nameStepHint": "Enter your name exactly as it was registered (Korean or English spelling both work). Family members included in a household registration can check with their own name.",
"checkName": "Check",
"nameFoundTitle": "You are already registered",
"nameFoundHint": "You can receive an edit link at the email below to view or update your registration.",
"nameNotFoundTitle": "No registration found under this name",
"nameNotFoundHint": "If you have not registered yet, please continue with the email step to register.",
"goRegisterByEmail": "Register with Email",
"validationCheckName": "Please enter at least 2 characters."
```

- [ ] **Step 3: es.json**

같은 위치에 추가:
```json
"tabEmail": "Verificar por correo",
"tabName": "Verificar por nombre",
"nameLabel": "Nombre",
"nameStepHint": "Escriba el nombre tal como fue registrado (en coreano o en alfabeto latino). Los familiares incluidos en una inscripción familiar también pueden verificar con su propio nombre.",
"checkName": "Verificar",
"nameFoundTitle": "Ya está inscrito",
"nameFoundHint": "Puede recibir un enlace de edición en el correo indicado abajo para ver o modificar su inscripción.",
"nameNotFoundTitle": "No se encontró ninguna inscripción con este nombre",
"nameNotFoundHint": "Si aún no se ha inscrito, continúe con el paso de correo para registrarse.",
"goRegisterByEmail": "Inscribirse con correo",
"validationCheckName": "Ingrese al menos 2 caracteres."
```

- [ ] **Step 4: 키 파리티 검증**

Run:
```bash
python3 -c "
import json
keys = {}
for loc in ['ko','en','es']:
    keys[loc] = set(json.load(open(f'messages/{loc}.json'))['Register'].keys())
assert keys['ko'] == keys['en'] == keys['es'], (keys['ko'] ^ keys['en'], keys['ko'] ^ keys['es'])
print('parity OK', len(keys['ko']), 'keys')
"
```
Expected: `parity OK 38 keys` (기존 27 + 신규 11).

- [ ] **Step 5: Commit**

```bash
git add messages/ko.json messages/en.json messages/es.json
git commit -m "feat(i18n): 등록 이름 확인 탭 문구 ko/en/es

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `RegistrationForm` 1단계 탭 UI

**Files:**
- Modify: `src/components/RegistrationForm.tsx`

**Interfaces:**
- Consumes: `checkName`, `type CheckNameResult`(Task 2 — import는 값만: `checkName`), i18n 키 11개(Task 3), 기존 `checking`/`goToEdit` 키, 기존 `labelClass`/`inputClass` 상수, 기존 `checking`(useTransition)·`Link`.
- Produces: 없음(리프 컴포넌트).

- [ ] **Step 1: import·상수·state·핸들러 추가**

`src/components/RegistrationForm.tsx` 수정.

(a) import에 `checkName` 추가 — 기존 import 블록:
```ts
import {
  insertRegistration,
  checkEmail,
  checkName,
  type PersonInput,
  type RegistrationPayload,
} from "@/app/[locale]/register/actions";
```

(b) `inputClass` 상수 아래에 탭 클래스 추가:
```ts
const tabActiveClass =
  "flex-1 rounded-md bg-white px-3 py-2 text-center font-semibold text-emerald-700 shadow-sm";
const tabIdleClass =
  "flex-1 rounded-md px-3 py-2 text-center text-slate-500 hover:text-slate-700";
```

(c) 컴포넌트 내 `// 1단계: 이메일 확인` state 블록 아래에 추가:
```ts
// 1단계: 이름으로 확인 (확인 전용 — 폼 진행은 이메일 탭에서만)
const [checkTab, setCheckTab] = useState<"email" | "name">("email");
const [nameInput, setNameInput] = useState("");
const [nameError, setNameError] = useState<string | null>(null);
const [nameResult, setNameResult] = useState<{
  matched: boolean;
  maskedEmails: string[];
} | null>(null);
```

(d) `submitEmail` 함수 아래에 핸들러 추가:
```ts
function submitName(e: React.FormEvent) {
  e.preventDefault();
  setNameError(null);
  setNameResult(null);
  startCheck(async () => {
    const res = await checkName(nameInput);
    if (!res.ok) {
      setNameError(res.error);
      return;
    }
    setNameResult({ matched: res.matched, maskedEmails: res.maskedEmails });
  });
}
```

- [ ] **Step 2: phase "email" 렌더를 탭 구조로 확장**

현재 `if (phase === "email") { return ( <form onSubmit={submitEmail} ...> ... ); }` 를 다음으로 교체. **기존 이메일 폼 JSX는 그대로** `checkTab === "email"` 분기 안으로 이동:
```tsx
// ── 1단계: 등록 여부 확인 (이메일/이름 탭) ──
if (phase === "email") {
  return (
    <div className="space-y-4">
      <div className="flex rounded-lg bg-slate-100 p-1 text-sm">
        <button
          type="button"
          onClick={() => setCheckTab("email")}
          className={checkTab === "email" ? tabActiveClass : tabIdleClass}
        >
          {t("tabEmail")}
        </button>
        <button
          type="button"
          onClick={() => setCheckTab("name")}
          className={checkTab === "name" ? tabActiveClass : tabIdleClass}
        >
          {t("tabName")}
        </button>
      </div>

      {checkTab === "email" ? (
        <form onSubmit={submitEmail} className="space-y-4">
          {/* …기존 이메일 폼 내용 전체를 여기로 그대로 이동… */}
        </form>
      ) : (
        <form onSubmit={submitName} className="space-y-4">
          <div>
            <label className={labelClass}>
              {t("nameLabel")} <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={nameInput}
              onChange={(e) => {
                setNameInput(e.target.value);
                setNameResult(null);
                setNameError(null);
              }}
              className={inputClass}
              placeholder="김철수 / John Kim"
            />
            <p className="mt-1 text-xs text-slate-500">{t("nameStepHint")}</p>
          </div>

          {nameError && (
            <p className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
              {t(nameError)}
            </p>
          )}

          {nameResult?.matched ? (
            <div className="rounded-xl bg-amber-50 p-5 ring-1 ring-amber-200">
              <p className="text-base font-semibold text-amber-900">
                {t("nameFoundTitle")}
              </p>
              <p className="mt-1 text-sm text-amber-800">{t("nameFoundHint")}</p>
              <ul className="mt-2 space-y-1">
                {nameResult.maskedEmails.map((m) => (
                  <li key={m} className="font-mono text-sm text-amber-900">
                    {m}
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                <Link
                  href="/edit"
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  {t("goToEdit")}
                </Link>
              </div>
            </div>
          ) : nameResult ? (
            <div className="rounded-xl bg-slate-50 p-5 ring-1 ring-slate-200">
              <p className="text-base font-semibold text-slate-800">
                {t("nameNotFoundTitle")}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {t("nameNotFoundHint")}
              </p>
              <button
                type="button"
                onClick={() => setCheckTab("email")}
                className="mt-4 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                {t("goRegisterByEmail")}
              </button>
            </div>
          ) : (
            <button
              type="submit"
              disabled={checking}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
            >
              {checking ? t("checking") : t("checkName")}
            </button>
          )}
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 정적 검증**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 모두 오류 없음.

- [ ] **Step 4: 브라우저 검증**

사전 조건: `supabase start` 상태 + Task 1 Step 3의 seed 3행을 다시 insert(psql 동일 블록의 insert 부분만) + `npm run dev`.

http://localhost:3000/register 에서:
1. 탭 2개 표시, 기본 [이메일로 확인]. 기존 이메일 흐름 회귀 없음(미등록 이메일 → 폼 진행).
2. [이름으로 확인] → "김 철수" 입력 → 확인하기 → amber 카드: 등록됨 + 마스킹 이메일 2개(`jo***@gm***.com`, `ot***@na***.com`) + [내 정보 수정하러 가기] 링크가 `/edit`로 이동.
3. "younghee kim" → amber 카드 + `jo***@gm***.com` 1개 (구성원→가구주 역추적).
4. "홍길동" → slate 카드(등록 내역 없음) + [이메일로 새로 등록하기] 클릭 시 이메일 탭 전환.
5. "김" → 인라인 에러(`validationCheckName` 문구).
6. `/en/register`, `/es/register`에서 탭·문구 번역 표시 확인.
7. 검증 후 seed 3행 delete(psql cleanup 블록).

- [ ] **Step 5: Commit**

```bash
git add src/components/RegistrationForm.tsx
git commit -m "feat(register): 1단계 이름으로 등록 여부 확인 탭 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 배포 메모 (계획 범위 밖, 병합 후)

- 프로덕션 Supabase에 0013 마이그레이션 적용(`supabase db push`) 필요 — 코드 배포보다 **먼저** 적용해야 이름 확인이 500 없이 동작.
- main 병합·push 시 Vercel 자동 배포.
