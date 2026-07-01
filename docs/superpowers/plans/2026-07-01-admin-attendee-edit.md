# 관리자 참석자 편집 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 참석자 개인 정보를 전용 페이지에서 수정하고, 삭제 시 가구주면 남은 구성원 중 최연장 등록자를 새 가구주로 원자적으로 승격한다.

**Architecture:** 새 RSC 편집 페이지(`/admin/attendees/[id]/edit`)가 참석자 단건 + 가구 맥락을 로드해 클라이언트 `AdminEditForm`에 넘긴다. 폼은 기존 `PersonFields`(서술 필드)를 재사용하고 email·관리자 필드(language/retreat_group/is_group_leader)를 추가한다. 저장은 서버액션 `adminUpdateAttendee`(화이트리스트), 삭제는 `adminDeleteAttendee`→Postgres RPC `admin_delete_attendee`(승격+재지정+삭제 원자적). 목록 표의 이름을 편집 링크로 만든다.

**Tech Stack:** Next.js 16 App Router(RSC + server actions), `@supabase/ssr`, next-intl v4, Tailwind v4, Supabase Postgres(RPC).

## Global Constraints

- Next 16 규칙: 이 저장소는 create-next-app 최신. 미들웨어는 `proxy.ts`. 새 라우트는 기존 패턴(RSC + 서버액션) 따를 것. 확신 없으면 `node_modules/next/dist/docs/` 확인.
- 인증 라우트/가드: 새 페이지는 `src/app/[locale]/admin/(protected)/` 아래 → 그룹 `layout.tsx`가 `getClaims()`로 `app_role=admin` 확인(자동 보호). 추가 인증 코드 불필요.
- Supabase: `@supabase/ssr`만, 쿠키 `getAll/setAll`. 서버는 `@/lib/supabase/server`의 `createClient()`(await 필요). 세션 검증은 `getClaims()`.
- RLS/트리거: 관리자(`is_admin()`)는 attendees update/delete 정책 통과. `guard_privileged_cols`·language guard 트리거는 admin이면 통과(관리자 컬럼 쓰기 허용). anon/member는 못 씀.
- enum 토큰 저장(화면 라벨은 messages 번역). 부분참석 시각은 datetime-local 문자열 **wall-clock 그대로 저장**(Date 변환 금지), 표시는 ISO `slice(0,16)`.
- `attendees.korean_name`은 nullable(0008), `name_required` check = korean_name 또는 english_name 최소 하나. `partial_requires_times` check = partial이면 arrival_at·departure_at 필수.
- 테스트 러너: **이 앱엔 JS 단위테스트 러너가 없음**(기존 패턴). UI/서버액션 검증 = `npx tsc --noEmit` + `npm run lint` + `npm run build` + Playwright(MCP) 브라우저 플로우. RPC는 로컬 Supabase DB에서 SQL로 검증.
- 로컬 개발: `supabase start` + `npm run dev`(http://localhost:3000, en=`/en`). 로컬 관리자 = logosguru@gmail.com 매직링크(Mailpit http://127.0.0.1:54324). 로컬 DB엔 현재 import된 48명 존재.
- 편집 안 함(이 페이지): paid/paid_at, room_id, is_householder/householder_id.

## File Structure

- `supabase/migrations/0009_admin_delete.sql` (신규) — `admin_delete_attendee(target uuid)` RPC.
- `src/app/[locale]/admin/actions.ts` (수정) — `AdminEditInput` 타입 + `adminUpdateAttendee` + `adminDeleteAttendee`.
- `src/components/AdminEditForm.tsx` (신규) — 클라이언트 편집 폼(PersonFields + email + 관리자 필드 + 저장/삭제).
- `src/app/[locale]/admin/(protected)/attendees/[id]/edit/page.tsx` (신규) — RSC 편집 페이지.
- `src/components/AdminAttendeeTable.tsx` (수정) — 이름 셀을 편집 링크로.
- `messages/{ko,en,es}.json` (수정) — Admin 편집 키.

---

### Task 1: 삭제+승격 RPC (`0009_admin_delete.sql`)

**Files:**
- Create: `supabase/migrations/0009_admin_delete.sql`

**Interfaces:**
- Produces: SQL 함수 `public.admin_delete_attendee(target uuid) returns void`. 관리자 세션에서만 동작(`is_admin()` 가드). target이 가구주면 구성원 중 `created_at` 최소인 1명을 `is_householder=true, householder_id=null`로 승격하고 나머지 구성원의 `householder_id`를 그 새 가구주로 재지정한 뒤 target 삭제. 비가구주/단독가구주는 바로 삭제.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0009_admin_delete.sql`:
```sql
-- =====================================================================
-- 관리자 참석자 삭제 + 가구주 승격 (원자적)
-- 가구주 삭제 시 남은 구성원 중 가장 먼저 등록된(created_at) 1명을 새 가구주로
-- 승격하고 나머지 구성원을 재지정한 뒤 삭제. 함수=단일 트랜잭션이라 원자적.
-- SECURITY INVOKER(기본): 내부 쿼리는 호출한 관리자의 RLS로 실행.
-- =====================================================================

create or replace function public.admin_delete_attendee(target uuid)
returns void
language plpgsql
as $$
declare
  is_head boolean;
  new_head uuid;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  select is_householder into is_head from public.attendees where id = target;
  if is_head is null then
    return;  -- 존재하지 않는 id: no-op
  end if;

  if is_head then
    select id into new_head
      from public.attendees
      where householder_id = target
      order by created_at asc
      limit 1;
    if new_head is not null then
      update public.attendees
        set is_householder = true, householder_id = null
        where id = new_head;
      update public.attendees
        set householder_id = new_head
        where householder_id = target and id <> new_head;
    end if;
  end if;

  delete from public.attendees where id = target;  -- 이 시점엔 참조 구성원 없음
end $$;

grant execute on function public.admin_delete_attendee(uuid) to authenticated;
```

- [ ] **Step 2: Apply to local DB**

Run: `supabase db reset`
Expected: `Applying migration 0009_admin_delete.sql...` 오류 없이 완료. (로컬 attendees는 초기화됨 — 다음 스텝에서 테스트 데이터 사용)

- [ ] **Step 3: Verify — 가구주 삭제 시 승격 (트랜잭션 롤백으로 실데이터 보존)**

Run (한 번에 실행):
```bash
docker exec -i supabase_db_retreat2026 psql -U postgres -d postgres <<'SQL'
begin;
set local request.jwt.claims = '{"app_metadata":{"app_role":"admin"}}';
insert into public.attendees (id, korean_name, is_householder, householder_id, created_at) values
 ('00000000-0000-0000-0000-000000000001','헤드', true,  null, '2020-01-01T00:00:00Z');
insert into public.attendees (id, korean_name, is_householder, householder_id, created_at) values
 ('00000000-0000-0000-0000-000000000002','멤버A', false, '00000000-0000-0000-0000-000000000001', '2020-01-02T00:00:00Z'),
 ('00000000-0000-0000-0000-000000000003','멤버B', false, '00000000-0000-0000-0000-000000000001', '2020-01-03T00:00:00Z');
select public.admin_delete_attendee('00000000-0000-0000-0000-000000000001');
do $$
declare
  head_gone boolean;
  a_is_head boolean; a_hh uuid;
  b_hh uuid;
begin
  select not exists(select 1 from public.attendees where id='00000000-0000-0000-0000-000000000001') into head_gone;
  select is_householder, householder_id into a_is_head, a_hh from public.attendees where id='00000000-0000-0000-0000-000000000002';
  select householder_id into b_hh from public.attendees where id='00000000-0000-0000-0000-000000000003';
  if not head_gone then raise exception 'FAIL: head not deleted'; end if;
  if not a_is_head or a_hh is not null then raise exception 'FAIL: 멤버A not promoted'; end if;
  if b_hh <> '00000000-0000-0000-0000-000000000002' then raise exception 'FAIL: 멤버B not repointed'; end if;
  raise notice 'PASS: 가구주 삭제→최연장 멤버A 승격, 멤버B 재지정';
end $$;
rollback;
SQL
```
Expected: `NOTICE: PASS: 가구주 삭제→최연장 멤버A 승격, 멤버B 재지정` 출력, 오류 없음. `rollback`으로 실데이터(48명) 보존.

- [ ] **Step 4: Verify — 비가구주 삭제 / 단독 가구주 삭제**

Run:
```bash
docker exec -i supabase_db_retreat2026 psql -U postgres -d postgres <<'SQL'
begin;
set local request.jwt.claims = '{"app_metadata":{"app_role":"admin"}}';
insert into public.attendees (id, korean_name, is_householder, householder_id, created_at) values
 ('00000000-0000-0000-0000-0000000000a1','솔로', true, null, '2020-01-01T00:00:00Z'),
 ('00000000-0000-0000-0000-0000000000b1','헤드2', true, null, '2020-01-01T00:00:00Z'),
 ('00000000-0000-0000-0000-0000000000b2','멤버', false, '00000000-0000-0000-0000-0000000000b1', '2020-01-02T00:00:00Z');
select public.admin_delete_attendee('00000000-0000-0000-0000-0000000000a1');  -- 단독 가구주
select public.admin_delete_attendee('00000000-0000-0000-0000-0000000000b2');  -- 비가구주
do $$
declare solo_gone boolean; member_gone boolean; head2_ok boolean;
begin
  select not exists(select 1 from public.attendees where id='00000000-0000-0000-0000-0000000000a1') into solo_gone;
  select not exists(select 1 from public.attendees where id='00000000-0000-0000-0000-0000000000b2') into member_gone;
  select (is_householder and householder_id is null) into head2_ok from public.attendees where id='00000000-0000-0000-0000-0000000000b1';
  if not solo_gone then raise exception 'FAIL: 단독 가구주 미삭제'; end if;
  if not member_gone then raise exception 'FAIL: 비가구주 미삭제'; end if;
  if not head2_ok then raise exception 'FAIL: 헤드2가 영향받음'; end if;
  raise notice 'PASS: 단독가구주·비가구주 삭제 정상, 무관 가구주 불변';
end $$;
rollback;
SQL
```
Expected: `NOTICE: PASS: ...` 출력, 오류 없음.

> 만약 `auth.jwt()`/`request.jwt.claims`로 is_admin()이 true가 안 되면(로컬 세팅 차이), 디버그로 `select public.is_admin();`를 같은 트랜잭션에서 확인. 함수 자체 로직(승격)은 `is_admin()` 가드를 임시로 우회해 검증 후 되돌리지 말 것 — 대신 claim 세팅을 교정.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0009_admin_delete.sql
git commit -m "feat(admin): admin_delete_attendee RPC — 가구주 삭제 시 최연장 구성원 승격"
```

---

### Task 2: 서버 액션 (`adminUpdateAttendee`, `adminDeleteAttendee`)

**Files:**
- Modify: `src/app/[locale]/admin/actions.ts`

**Interfaces:**
- Consumes: `admin_delete_attendee` RPC(Task 1), `PersonInput`(from `../register/actions`), `createClient`(from `@/lib/supabase/server`), `Language`(from `@/lib/types`).
- Produces:
  - `type AdminEditInput = PersonInput & { email?: string; language: Language; retreat_group?: string; is_group_leader?: boolean }`
  - `adminUpdateAttendee(id: string, input: AdminEditInput): Promise<{ok:true}|{ok:false,error:string}>`
  - `adminDeleteAttendee(id: string): Promise<{ok:true}|{ok:false,error:string}>`

- [ ] **Step 1: Implement (no JS test runner — tsc is the gate)**

기존 `src/app/[locale]/admin/actions.ts` 상단 import 블록에 `Language`가 이미 import되어 있음(`setLanguage`용). `PersonInput` import + `clean` 헬퍼 + 두 액션을 파일 끝에 추가:

```ts
import type { PersonInput } from "../register/actions";

export type AdminEditInput = PersonInput & {
  email?: string;
  language: Language;
  retreat_group?: string;
  is_group_leader?: boolean;
};

function clean(s?: string | null): string | null {
  const v = (s ?? "").trim();
  return v === "" ? null : v;
}

// 관리자 전체 편집(화이트리스트). admin은 RLS + guard 트리거 통과.
export async function adminUpdateAttendee(
  id: string,
  input: AdminEditInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!clean(input.korean_name) && !clean(input.english_name)) {
    return { ok: false, error: "validationName" };
  }
  if (
    input.attendance === "partial" &&
    (!clean(input.arrival_at) || !clean(input.departure_at))
  ) {
    return { ok: false, error: "validationPartial" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("attendees")
    .update({
      korean_name: clean(input.korean_name),
      english_name: clean(input.english_name),
      district: clean(input.district),
      gender: input.gender ? input.gender : null,
      role: input.role ? input.role : "member",
      phone: clean(input.phone),
      email: clean(input.email),
      is_under_6: !!input.is_under_6,
      attendance: input.attendance,
      arrival_at:
        input.attendance === "partial" ? clean(input.arrival_at) : null,
      departure_at:
        input.attendance === "partial" ? clean(input.departure_at) : null,
      note: clean(input.note),
      language: input.language,
      retreat_group: clean(input.retreat_group),
      is_group_leader: !!input.is_group_leader,
    })
    .eq("id", id);

  if (error) return { ok: false, error: "updateError" };
  return { ok: true };
}

// 삭제(+가구주 승격은 RPC가 원자적으로 처리).
export async function adminDeleteAttendee(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_attendee", { target: id });
  if (error) return { ok: false, error: "deleteError" };
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 오류 없음(빈 출력).

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/admin/actions.ts"
git commit -m "feat(admin): adminUpdateAttendee(화이트리스트) + adminDeleteAttendee(RPC)"
```

---

### Task 3: AdminEditForm 컴포넌트 + i18n 키

**Files:**
- Create: `src/components/AdminEditForm.tsx`
- Modify: `messages/ko.json`, `messages/en.json`, `messages/es.json`

**Interfaces:**
- Consumes: `adminUpdateAttendee`, `adminDeleteAttendee`, `AdminEditInput`(Task 2); `PersonFields`(from `./PersonFields`); `Attendee`, `LANGUAGES`, `Language`(from `@/lib/types`); `useRouter`(from `@/i18n/navigation`).
- Produces: `export function AdminEditForm({ initial }: { initial: Attendee }): JSX.Element` — Task 4의 page가 사용.

- [ ] **Step 1: Add i18n keys (Admin 네임스페이스)**

`messages/ko.json`의 `"Admin"` 객체에 아래 키 추가(기존 키 뒤, 예: `"under6"` 다음 줄):
```json
    "editTitle": "참석자 수정",
    "adminFields": "관리자 항목",
    "groupLeader": "조장",
    "saved": "저장되었습니다.",
    "saveError": "저장에 실패했습니다.",
    "deleteBtn": "삭제",
    "deleteConfirm": "정말 삭제할까요? 가구주면 남은 구성원 중 가장 먼저 등록한 사람이 새 가구주가 됩니다.",
    "deleteError": "삭제에 실패했습니다.",
    "backToList": "← 목록으로",
    "householdLabel": "가구",
```

`messages/en.json`의 `"Admin"`에:
```json
    "editTitle": "Edit attendee",
    "adminFields": "Admin fields",
    "groupLeader": "Group leader",
    "saved": "Saved.",
    "saveError": "Failed to save.",
    "deleteBtn": "Delete",
    "deleteConfirm": "Delete this person? If they are the householder, the earliest-registered remaining member becomes the new householder.",
    "deleteError": "Failed to delete.",
    "backToList": "← Back to list",
    "householdLabel": "Household",
```

`messages/es.json`의 `"Admin"`에:
```json
    "editTitle": "Editar asistente",
    "adminFields": "Campos de administrador",
    "groupLeader": "Líder de grupo",
    "saved": "Guardado.",
    "saveError": "No se pudo guardar.",
    "deleteBtn": "Eliminar",
    "deleteConfirm": "¿Eliminar a esta persona? Si es el jefe de familia, el miembro restante registrado primero pasa a serlo.",
    "deleteError": "No se pudo eliminar.",
    "backToList": "← Volver a la lista",
    "householdLabel": "Hogar",
```
> 재사용: `Common.save`, `Common.submitting`, `Common.cancel`, `Language.ko/en/es`, `Admin.colLanguage`(언어 라벨), `Admin.colGroup`(수련회조 라벨), `Fields.email`.

- [ ] **Step 2: Create AdminEditForm**

`src/components/AdminEditForm.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { PersonFields } from "./PersonFields";
import {
  adminUpdateAttendee,
  adminDeleteAttendee,
  type AdminEditInput,
} from "@/app/[locale]/admin/actions";
import { LANGUAGES, type Attendee } from "@/lib/types";

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";
const labelClass = "block text-sm font-medium text-slate-700";

function toInput(a: Attendee): AdminEditInput {
  return {
    korean_name: a.korean_name ?? "",
    english_name: a.english_name ?? "",
    district: a.district ?? "",
    gender: a.gender ?? "",
    role: a.role ?? "",
    phone: a.phone ?? "",
    email: a.email ?? "",
    is_under_6: a.is_under_6,
    attendance: a.attendance,
    arrival_at: a.arrival_at ? a.arrival_at.slice(0, 16) : "",
    departure_at: a.departure_at ? a.departure_at.slice(0, 16) : "",
    note: a.note ?? "",
    language: a.language,
    retreat_group: a.retreat_group ?? "",
    is_group_leader: a.is_group_leader,
  };
}

export function AdminEditForm({ initial }: { initial: Attendee }) {
  const t = useTranslations("Admin");
  const tc = useTranslations("Common");
  const tf = useTranslations("Fields");
  const tl = useTranslations("Language");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [data, setData] = useState<AdminEditInput>(() => toInput(initial));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function patch(p: Partial<AdminEditInput>) {
    setData((d) => ({ ...d, ...p }));
    setSaved(false);
  }

  function save() {
    setSaved(false);
    setError(null);
    start(async () => {
      const r = await adminUpdateAttendee(initial.id, data);
      if (r.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(t("saveError"));
      }
    });
  }

  function del() {
    setError(null);
    start(async () => {
      const r = await adminDeleteAttendee(initial.id);
      if (r.ok) {
        router.push("/admin/attendees");
      } else {
        setError(t("deleteError"));
        setConfirming(false);
      }
    });
  }

  return (
    <div className="space-y-6">
      <PersonFields value={data} onChange={patch} groupId={`admin-${initial.id}`} showContact />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelClass}>{tf("email")}</label>
          <input
            type="email"
            value={data.email ?? ""}
            onChange={(e) => patch({ email: e.target.value })}
            className={inputClass}
          />
        </div>
      </div>

      <fieldset className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
        <legend className="px-1 text-sm font-semibold text-slate-700">
          {t("adminFields")}
        </legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>{t("colLanguage")}</label>
            <select
              value={data.language}
              onChange={(e) => patch({ language: e.target.value as AdminEditInput["language"] })}
              className={inputClass}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {tl(l)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>{t("colGroup")}</label>
            <input
              type="text"
              value={data.retreat_group ?? ""}
              onChange={(e) => patch({ retreat_group: e.target.value })}
              className={inputClass}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={!!data.is_group_leader}
              onChange={(e) => patch({ is_group_leader: e.target.checked })}
            />
            {t("groupLeader")}
          </label>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? tc("submitting") : tc("save")}
        </button>
        {saved && <span className="text-sm text-emerald-700">{t("saved")}</span>}
        {error && <span className="text-sm text-rose-700">{error}</span>}

        <span className="flex-1" />

        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-300 hover:bg-rose-50"
          >
            {t("deleteBtn")}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-rose-700">{t("deleteConfirm")}</span>
            <button
              type="button"
              disabled={pending}
              onClick={del}
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              {t("deleteBtn")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
            >
              {tc("cancel")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 4: Commit**

```bash
git add src/components/AdminEditForm.tsx messages/ko.json messages/en.json messages/es.json
git commit -m "feat(admin): AdminEditForm(PersonFields+email+관리자필드+저장/삭제) + i18n"
```

---

### Task 4: 편집 페이지 (RSC) + 표 이름 링크

**Files:**
- Create: `src/app/[locale]/admin/(protected)/attendees/[id]/edit/page.tsx`
- Modify: `src/components/AdminAttendeeTable.tsx`

**Interfaces:**
- Consumes: `AdminEditForm`(Task 3); `createClient`(`@/lib/supabase/server`); `Attendee`(`@/lib/types`); `displayName`(`@/lib/names`); `Link`(`@/i18n/navigation`); `notFound`(`next/navigation`); `getTranslations`,`setRequestLocale`(`next-intl/server`).

- [ ] **Step 1: Create the edit page**

`src/app/[locale]/admin/(protected)/attendees/[id]/edit/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminEditForm } from "@/components/AdminEditForm";
import { displayName } from "@/lib/names";
import type { Attendee } from "@/lib/types";

export default async function AdminEditAttendeePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data: attendee } = await supabase
    .from("attendees")
    .select("*")
    .eq("id", id)
    .single();

  if (!attendee) notFound();
  const a = attendee as Attendee;

  // 읽기전용 가구 맥락
  const headId = a.is_householder ? a.id : a.householder_id;
  let household: Pick<Attendee, "id" | "korean_name" | "english_name" | "is_householder">[] = [];
  if (headId) {
    const { data } = await supabase
      .from("attendees")
      .select("id, korean_name, english_name, is_householder")
      .or(`id.eq.${headId},householder_id.eq.${headId}`)
      .order("is_householder", { ascending: false });
    household = data ?? [];
  }

  const t = await getTranslations("Admin");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/admin/attendees" className="text-sm text-slate-500 hover:text-slate-900">
        {t("backToList")}
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">
        {t("editTitle")} — {displayName(a)}
      </h1>

      {household.length > 1 && (
        <p className="mt-2 text-sm text-slate-500">
          {t("householdLabel")}:{" "}
          {household
            .map((m) => displayName(m) + (m.is_householder ? ` (${t("householder")})` : ""))
            .join(", ")}
        </p>
      )}

      <div className="mt-6">
        <AdminEditForm initial={a} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Link the name in AdminAttendeeTable**

`src/components/AdminAttendeeTable.tsx`에서 import에 `Link` 추가(파일 상단 import 그룹, `useRouter` import 아래):
```tsx
import { Link } from "@/i18n/navigation";
```
그리고 이름 셀을 링크로 교체:
```tsx
                  <Link
                    href={`/admin/attendees/${a.id}/edit`}
                    className="font-medium text-emerald-700 hover:underline"
                  >
                    {displayName(a)}
                  </Link>
```
(기존 `<span className="font-medium text-slate-900">{displayName(a)}</span>` 대체)

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: 타입 오류 없음. 빌드 성공, 라우트 목록에 `/[locale]/admin/(protected)/attendees/[id]/edit`(동적 `ƒ`) 표시.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/admin/(protected)/attendees/[id]/edit/page.tsx" src/components/AdminAttendeeTable.tsx
git commit -m "feat(admin): 참석자 편집 페이지 RSC + 표 이름→편집 링크"
```

---

### Task 5: 전체 검증 (정적 + 브라우저 E2E)

**Files:** (없음 — 검증 전용. 발견 시 해당 파일 수정 후 재검증)

- [ ] **Step 1: Static gates**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 셋 다 오류 없음.

- [ ] **Step 2: Browser E2E — 편집 (Playwright MCP)**

로컬 `supabase start` + `npm run dev` 상태에서:
1. 관리자 로그인(logosguru@gmail.com 매직링크 → Mailpit http://127.0.0.1:54324에서 링크 열기).
2. `/admin/attendees`로 이동 → 참석자 이름 클릭 → 편집 페이지 진입 확인.
3. 구역·직분·이메일·언어·수련회조·조장 등 수정 → 저장 → "저장되었습니다." 표시.
4. 목록으로 돌아가 값이 반영됐는지 확인.
Expected: 저장 성공, 값 반영. 콘솔 에러 0.

- [ ] **Step 3: Browser E2E — 삭제 + 승격**

1. 구성원이 있는 가구의 **가구주** 편집 페이지 진입 → "삭제" → 확인 문구 → "삭제" 확정.
2. 목록으로 리다이렉트됨. 해당 가구주가 사라지고, **가장 먼저 등록된 구성원이 새 가구주(가구 배지/열)로 승격**됐는지 확인.
3. 비가구주 1명 삭제 → 목록에서 사라지고 다른 가구원 불변 확인.
Expected: 승격·삭제 정상. (검증 후 로컬 데이터가 바뀌므로, 필요하면 `supabase db reset` 후 재-import로 복구 가능.)

- [ ] **Step 4: 회귀 — 성도 본인 수정/등록 폼 영향 없음**

`/register`와 매직링크 `/edit` 흐름이 여전히 동작하는지(PersonFields 공유) 스모크 확인: `/register` 페이지 정상 렌더 + 이름 하나만 넣어 검증 통과하는지.
Expected: 기존 흐름 정상.

- [ ] **Step 5: Commit (검증 로그/수정사항 있으면)**

검증 중 수정이 있었다면 커밋. 없으면 이 태스크는 커밋 없이 완료.

> **⚠️ 프로덕션 후속**: 병합 후 `supabase db push`로 마이그레이션 **0009를 프로덕션에도 적용**해야 삭제/승격이 라이브에서 동작함(0008과 동일 절차).

---

## Self-Review Notes

- **Spec coverage**: 전용 편집 페이지=Task4, PersonFields 재사용+관리자필드(language/retreat_group/is_group_leader)+email=Task3, adminUpdateAttendee 화이트리스트=Task2, adminDeleteAttendee+RPC 승격=Task1·2, 이름 링크=Task4, i18n=Task3, 삭제 UX(인라인 확인→리다이렉트)=Task3, 읽기전용 가구 맥락=Task4, 검증(tsc/lint/build+Playwright+RPC DB테스트)=Task1·5. ✅
- **범위 밖(YAGNI)**: 신규 추가·가구 구조 직접 재지정·방/회비 편집·일괄편집 — 계획에 없음. ✅
- **타입 일관성**: `AdminEditInput`(Task2)를 Task3 `toInput`/폼이 그대로 사용. `adminUpdateAttendee`/`adminDeleteAttendee` 시그니처 Task2 정의=Task3 호출 일치. `admin_delete_attendee(target)` RPC명=서버액션 rpc 호출명 일치. ✅
- **email**: PersonInput에 email이 없어 AdminEditInput에 추가하고 폼에서 별도 렌더(Task3)·화이트리스트 포함(Task2). ✅
- **테스트 현실**: JS 단위테스트 러너 부재 → tsc/lint/build + 브라우저 + RPC DB테스트로 대체(Global Constraints 명시). ✅
