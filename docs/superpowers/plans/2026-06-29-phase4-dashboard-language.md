# Phase 4 — 대시보드 + 성도 언어 구분 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 교역자/준비위원용 관리자 대시보드(등록·언어·방배정·회비·보조 집계)와, 관리자 지정 성도 언어 구분(한국어/영어/Spanish 데이터)을 추가한다.

**Architecture:** `attendees.language` enum(ko/en/es, 기본 ko)을 관리자 전용 컬럼으로 추가(guard 트리거 보호). 관리자는 참석자 화면 셀렉트로 언어 지정. `/admin`을 대시보드로 바꾸고(집계는 `lib/dashboard.ts` 순수 함수, `fees.ts` 재사용), 기존 목록은 `/admin/attendees`로 이동.

**Tech Stack:** Next.js 16(App Router) · Supabase(@supabase/ssr) · next-intl v4 · Tailwind v4 · TypeScript

## Global Constraints

- **Next.js 16**: 서버 컴포넌트는 `setRequestLocale(locale)` + `await params`. Mutation은 Server Action. 네비게이션은 `@/i18n/navigation`.
- **Supabase**: 서버 클라이언트 `createClient()`(async) from `@/lib/supabase/server`.
- **언어 = 데이터 속성**(성도가 쓰는 언어), **사이트 UI 로케일(ko/en)과 별개**. enum `language_t('ko','en','es')`, 기본 'ko'. **관리자 전용 컬럼** — 등록 폼/성도 수정엔 노출 안 함, `guard_privileged_cols` 트리거로 비관리자 변경 차단.
- **Spanish UI 번역은 범위 밖**: `Language` 네임스페이스는 ko/en 라벨만 추가(es 값의 라벨은 양 로케일에서 "Spanish"). 사이트 로케일에 es 추가 안 함.
- **회비/방 규칙 재사용**: `personFee`(6세미만=0·미배정=null), `groupHouseholds`, `formatUSD` (`src/lib/fees.ts`). 6세 미만은 객실 정원 미집계.
- **현재 guard 함수 보호 컬럼**(0002 기준): paid, paid_at, retreat_group, is_group_leader, is_householder, householder_id, room_id. 여기에 **language 추가**(나머지 보존).
- **i18n**: `useTranslations`는 컴포넌트 상단(서버 컴포넌트에서도 sync 사용 가능 — About 페이지 패턴). ko/en 키 파리티 필수.
- **검증 도구**(단위 테스트 러너 없음): `npx tsc --noEmit`, `npm run lint`, `npm run build`, `supabase db reset` + `docker exec -i supabase_db_retreat2026 psql -U postgres -d postgres`, node 로직 체크, 브라우저(관리자 로그인 필요한 화면은 컨트롤러가 통합 검증).
- **커밋 메시지** 말미: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- 작업 브랜치: `phase4-dashboard-language` (이미 생성됨).

---

### Task 1: 마이그레이션 — `language` 컬럼 + guard 트리거

**Files:**
- Create: `supabase/migrations/0007_language.sql`

**Interfaces:**
- Produces: enum `public.language_t('ko','en','es')`; `attendees.language language_t not null default 'ko'`; `guard_privileged_cols`가 language도 보호.

- [ ] **Step 1: 마이그레이션 작성**

Create `supabase/migrations/0007_language.sql`:
```sql
-- =====================================================================
-- Phase 4: 성도 언어 구분 (관리자 지정, UI 로케일과 별개)
-- =====================================================================
create type public.language_t as enum ('ko', 'en', 'es');  -- 한국어/영어/Spanish

alter table public.attendees
  add column language public.language_t not null default 'ko';

-- 관리자 전용 컬럼 보호: language 추가 (비관리자 UPDATE 시 OLD 복원)
create or replace function public.guard_privileged_cols()
returns trigger language plpgsql as $$
begin
  if not public.is_admin() then
    new.paid            := old.paid;
    new.paid_at         := old.paid_at;
    new.retreat_group   := old.retreat_group;
    new.is_group_leader := old.is_group_leader;
    new.is_householder  := old.is_householder;
    new.householder_id  := old.householder_id;
    new.room_id         := old.room_id;
    new.language        := old.language;
  end if;
  return new;
end $$;
```

- [ ] **Step 2: 적용**

Run: `supabase db reset`
Expected: 0001~0007 오류 없이 적용.

- [ ] **Step 3: 스키마 + 트리거 확인**

Run:
```bash
docker exec -i supabase_db_retreat2026 psql -U postgres -d postgres <<'SQL'
select enum_range(null::public.language_t);
select column_name, data_type, udt_name, column_default, is_nullable
  from information_schema.columns
  where table_name='attendees' and column_name='language';
select pg_get_functiondef('public.guard_privileged_cols()'::regprocedure) like '%new.language := old.language%' as guards_language;
SQL
```
Expected:
- `enum_range` → `{ko,en,es}`
- language 행: `udt_name=language_t`, `column_default='ko'::language_t`, `is_nullable=NO`
- `guards_language → t`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0007_language.sql
git commit -m "$(cat <<'EOF'
feat(phase4): attendees.language enum(ko/en/es, 기본 ko) + guard 트리거 보호

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 타입 — `Language` + `Attendee.language`

**Files:**
- Modify: `src/lib/types.ts`

**Interfaces:**
- Consumes: 없음.
- Produces: `LANGUAGES = ["ko","en","es"] as const`; `type Language`; `Attendee.language: Language`.

- [ ] **Step 1: enum 추가**

`src/lib/types.ts`에서 기존 `ATTENDANCE`/`Attendance` 정의 블록 다음에 추가:
```ts
export const LANGUAGES = ["ko", "en", "es"] as const; // 한국어/영어/Spanish (관리자 지정)
export type Language = (typeof LANGUAGES)[number];
```

- [ ] **Step 2: Attendee에 language 필드 추가**

`Attendee` 인터페이스의 `room_id: string | null;` 줄 **다음**에 추가:
```ts
  language: Language; // 성도 언어 (관리자 전용, 기본 'ko')
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "$(cat <<'EOF'
feat(phase4): Language 타입 + Attendee.language

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 언어 지정 UI (`setLanguage` + 참석자 표 셀렉트 + Language i18n)

**Files:**
- Modify: `src/app/[locale]/admin/actions.ts`
- Modify: `src/components/AdminAttendeeTable.tsx`
- Modify: `messages/ko.json`, `messages/en.json`

**Interfaces:**
- Consumes: `Language`/`LANGUAGES`(Task 2).
- Produces: `setLanguage(id: string, language: Language): Promise<{ ok: boolean }>`.

- [ ] **Step 1: 서버 액션 추가**

`src/app/[locale]/admin/actions.ts` — 상단 import 추가 + 액션 추가. 파일 전체를 다음으로 교체:
```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import type { Language } from "@/lib/types";

// 회비 납부 토글 (관리자 전용). RLS + 클레임으로 관리자만 통과.
export async function setPaid(id: string, paid: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("attendees")
    .update({ paid, paid_at: paid ? new Date().toISOString() : null })
    .eq("id", id);
  return { ok: !error };
}

// 성도 언어 지정 (관리자 전용).
export async function setLanguage(id: string, language: Language) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("attendees")
    .update({ language })
    .eq("id", id);
  return { ok: !error };
}
```

- [ ] **Step 2: i18n `Language` 네임스페이스 추가**

`messages/ko.json` 최상위(마지막 네임스페이스 뒤, 콤마 주의)에 추가:
```json
  ,
  "Language": {
    "ko": "한국어",
    "en": "영어",
    "es": "Spanish"
  }
```
`messages/en.json` 동일 위치에:
```json
  ,
  "Language": {
    "ko": "Korean",
    "en": "English",
    "es": "Spanish"
  }
```

- [ ] **Step 3: 참석자 표에 언어 셀렉트 추가**

`src/components/AdminAttendeeTable.tsx` 전체를 다음으로 교체:
```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { setPaid, setLanguage } from "@/app/[locale]/admin/actions";
import { LANGUAGES, type Language } from "@/lib/types";
import {
  personFee,
  formatUSD,
  type AttendeeWithRoom,
  type Household,
} from "@/lib/fees";

export function AdminAttendeeTable({ households }: { households: Household[] }) {
  const t = useTranslations("Admin");
  const tr = useTranslations("Role");
  const tf = useTranslations("Fee");
  const trm = useTranslations("Rooms");
  const tl = useTranslations("Language");
  const router = useRouter();
  const [, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function togglePaid(headId: string, current: boolean) {
    setBusy(headId);
    start(async () => {
      await setPaid(headId, !current);
      setBusy(null);
      router.refresh();
    });
  }

  function changeLang(id: string, language: Language) {
    start(async () => {
      await setLanguage(id, language);
      router.refresh();
    });
  }

  function feeText(a: AttendeeWithRoom) {
    const f = personFee(a);
    if (a.is_under_6) return tf("exempt");
    if (f == null) return tf("pending");
    return formatUSD(f);
  }

  if (households.length === 0) {
    return (
      <p className="rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-600">
        {t("empty")}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {households.map((h) => {
        const people: AttendeeWithRoom[] = [h.head, ...h.members];
        return (
          <div
            key={h.head.id}
            className="overflow-hidden rounded-xl ring-1 ring-slate-200"
          >
            <div className="flex items-center justify-between bg-slate-50 px-4 py-2">
              <div className="text-sm font-medium text-slate-700">
                {h.head.korean_name} {t("householder")} ·{" "}
                {formatUSD(h.total)}
                {h.unassignedCount > 0 && (
                  <span className="ml-2 text-xs text-amber-600">
                    {tf("unassignedNotice", { count: h.unassignedCount })}
                  </span>
                )}
              </div>
              <button
                disabled={busy === h.head.id}
                onClick={() => togglePaid(h.head.id, h.head.paid)}
                className={
                  h.head.paid
                    ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-200 disabled:opacity-60"
                    : "rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-300 disabled:opacity-60"
                }
              >
                {h.head.paid ? tf("paid") : tf("unpaid")}
              </button>
            </div>
            <table className="min-w-full divide-y divide-slate-100 bg-white text-sm">
              <tbody className="divide-y divide-slate-100">
                {people.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2">
                      <span className="font-medium text-slate-900">
                        {a.korean_name}
                      </span>
                      {a.is_under_6 && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                          {t("under6")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {a.role ? tr(a.role) : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={a.language}
                        onChange={(e) =>
                          changeLang(a.id, e.target.value as Language)
                        }
                        className="rounded-md border border-slate-300 px-1.5 py-1 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        {LANGUAGES.map((l) => (
                          <option key={l} value={l}>
                            {tl(l)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {a.rooms?.label ?? trm("unassigned")}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-700">
                      {feeText(a)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: 검증 (tsc/lint + 파리티)**

Run:
```bash
npx tsc --noEmit && npm run lint
node -e 'const ko=require("./messages/ko.json"),en=require("./messages/en.json");const k=o=>Object.entries(o).flatMap(([a,v])=>typeof v==="object"&&v?Object.keys(v).map(x=>a+"."+x):[a]);const A=new Set(k(ko)),B=new Set(k(en));const x=[...A].filter(y=>!B.has(y)),z=[...B].filter(y=>!A.has(y));if(x.length||z.length){console.error("MISMATCH",{x,z});process.exit(1)}console.log("OK keys",A.size)'
```
Expected: tsc/lint 오류 없음, `OK keys <N>`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/admin/actions.ts" src/components/AdminAttendeeTable.tsx messages/ko.json messages/en.json
git commit -m "$(cat <<'EOF'
feat(phase4): 관리자 언어 지정(setLanguage + 참석자 표 셀렉트 + Language i18n)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 집계 헬퍼 — `lib/dashboard.ts`

**Files:**
- Create: `src/lib/dashboard.ts`

**Interfaces:**
- Consumes: `personFee`/`groupHouseholds`/`AttendeeWithRoom`(`fees.ts`), `Attendee.language`(Task 2).
- Produces: `computeDashboard(attendees: AttendeeWithRoom[], rooms: RoomForStats[]): DashboardStats`; 타입 `RoomForStats`, `DashboardStats`, `RoomOccupancy`, `CountItem`.

- [ ] **Step 1: 작성**

Create `src/lib/dashboard.ts`:
```ts
import { groupHouseholds, type AttendeeWithRoom } from "./fees";

// 대시보드 정원 집계용 rooms 조회 형태: rooms + room_types(name, capacity)
export type RoomForStats = {
  room_types: { name: string; capacity: number } | null;
};

export interface RoomOccupancy {
  name: string;
  occupied: number; // 배정된 비-6세미만 인원
  capacityTotal: number; // 해당 타입 객실 정원 합
  roomCount: number;
}

export interface CountItem {
  key: string;
  count: number;
}

export interface DashboardStats {
  totalPeople: number;
  households: number;
  under6: number;
  full: number;
  partial: number;
  language: { ko: number; en: number; es: number };
  assigned: number; // room_id 있는 인원(6세미만 포함)
  unassigned: number; // 6세미만 아닌데 미배정
  rooms: RoomOccupancy[];
  grandTotal: number;
  paidTotal: number;
  unpaidTotal: number;
  paidHouseholds: number;
  byDistrict: CountItem[];
  byRole: CountItem[];
}

export function computeDashboard(
  attendees: AttendeeWithRoom[],
  rooms: RoomForStats[],
): DashboardStats {
  const households = groupHouseholds(attendees);
  const grandTotal = households.reduce((s, h) => s + h.total, 0);
  const paidTotal = households
    .filter((h) => h.head.paid)
    .reduce((s, h) => s + h.total, 0);

  // 객실 타입별 정원/방수
  const cap = new Map<string, { capacityTotal: number; roomCount: number }>();
  for (const r of rooms) {
    const name = r.room_types?.name;
    if (!name) continue;
    const cur = cap.get(name) ?? { capacityTotal: 0, roomCount: 0 };
    cur.capacityTotal += r.room_types!.capacity;
    cur.roomCount += 1;
    cap.set(name, cur);
  }
  // 타입별 점유(배정된 비-6세미만; 6세미만은 정원 미집계)
  const occ = new Map<string, number>();
  for (const a of attendees) {
    if (a.room_id == null || a.is_under_6) continue;
    const name = a.rooms?.room_types?.name;
    if (!name) continue;
    occ.set(name, (occ.get(name) ?? 0) + 1);
  }
  const names = new Set<string>([...cap.keys(), ...occ.keys()]);
  const roomsStats: RoomOccupancy[] = [...names]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name,
      occupied: occ.get(name) ?? 0,
      capacityTotal: cap.get(name)?.capacityTotal ?? 0,
      roomCount: cap.get(name)?.roomCount ?? 0,
    }));

  const tally = (sel: (a: AttendeeWithRoom) => string | null): CountItem[] => {
    const m = new Map<string, number>();
    for (const a of attendees) {
      const k = sel(a);
      if (k == null || k === "") continue;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([key, count]) => ({ key, count }));
  };

  return {
    totalPeople: attendees.length,
    households: households.length,
    under6: attendees.filter((a) => a.is_under_6).length,
    full: attendees.filter((a) => a.attendance === "full").length,
    partial: attendees.filter((a) => a.attendance === "partial").length,
    language: {
      ko: attendees.filter((a) => a.language === "ko").length,
      en: attendees.filter((a) => a.language === "en").length,
      es: attendees.filter((a) => a.language === "es").length,
    },
    assigned: attendees.filter((a) => a.room_id != null).length,
    unassigned: attendees.filter((a) => a.room_id == null && !a.is_under_6)
      .length,
    rooms: roomsStats,
    grandTotal,
    paidTotal,
    unpaidTotal: grandTotal - paidTotal,
    paidHouseholds: households.filter((h) => h.head.paid).length,
    byDistrict: tally((a) => a.district).sort((x, y) =>
      x.key.localeCompare(y.key),
    ),
    byRole: tally((a) => a.role),
  };
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 3: 집계 로직 런타임 검증 (순수 JS 복제)**

Run (점유/미배정/언어 집계 핵심 로직을 복제해 확인):
```bash
node -e '
const att=[
  {is_under_6:false,attendance:"full",language:"ko",room_id:"r1",rooms:{room_types:{name:"2인실"}}},
  {is_under_6:false,attendance:"full",language:"es",room_id:"r1",rooms:{room_types:{name:"2인실"}}},
  {is_under_6:true, attendance:"full",language:"ko",room_id:"r1",rooms:{room_types:{name:"2인실"}}},
  {is_under_6:false,attendance:"partial",language:"en",room_id:null,rooms:null},
];
const occ=new Map();
for(const a of att){ if(a.room_id==null||a.is_under_6)continue; const n=a.rooms?.room_types?.name; occ.set(n,(occ.get(n)??0)+1);}
const unassigned=att.filter(a=>a.room_id==null&&!a.is_under_6).length;
const lang={ko:att.filter(a=>a.language==="ko").length,en:att.filter(a=>a.language==="en").length,es:att.filter(a=>a.language==="es").length};
console.log("occ 2인실:",occ.get("2인실"),"| unassigned:",unassigned,"| lang:",JSON.stringify(lang));
'
```
Expected: `occ 2인실: 2 | unassigned: 1 | lang: {"ko":2,"en":1,"es":1}` (6세미만 제외 점유=2, 미배정 1, 언어 집계 정확).

- [ ] **Step 4: Commit**

```bash
git add src/lib/dashboard.ts
git commit -m "$(cat <<'EOF'
feat(phase4): lib/dashboard.ts 집계(등록/언어/방배정/회비/보조)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 대시보드 UI + IA 이동 (`/admin`=대시보드, 목록→`/admin/attendees`)

**Files:**
- Create: `src/app/[locale]/admin/(protected)/attendees/page.tsx`
- Modify: `src/app/[locale]/admin/(protected)/page.tsx` (대시보드로 교체)
- Create: `src/components/AdminDashboard.tsx`
- Modify: `src/app/[locale]/admin/(protected)/layout.tsx` (서브내비)
- Modify: `messages/ko.json`, `messages/en.json` (Admin 대시보드 키)

**Interfaces:**
- Consumes: `computeDashboard`/`RoomForStats`/`DashboardStats`(Task 4), `AttendeeWithRoom`(`fees.ts`), `formatUSD`.

- [ ] **Step 1: 기존 목록을 `/admin/attendees`로 이동**

Create `src/app/[locale]/admin/(protected)/attendees/page.tsx` (현재 `page.tsx`의 목록 내용 그대로):
```tsx
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AdminAttendeeTable } from "@/components/AdminAttendeeTable";
import { groupHouseholds, type AttendeeWithRoom } from "@/lib/fees";

export default async function AdminAttendeesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data } = await supabase
    .from("attendees")
    .select("*, rooms(label, room_types(name, price_per_person))")
    .order("district", { ascending: true, nullsFirst: false })
    .order("is_householder", { ascending: false })
    .order("created_at", { ascending: true });

  const attendees = (data as AttendeeWithRoom[] | null) ?? [];
  const households = groupHouseholds(attendees);
  const grandTotal = households.reduce((s, h) => s + h.total, 0);
  const paidHouseholds = households.filter((h) => h.head.paid).length;

  const t = await getTranslations("Admin");

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
      <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-600">
        <span>{t("total", { count: attendees.length })}</span>
        <span>·</span>
        <span>{t("paidCount", { count: paidHouseholds })}</span>
        <span>·</span>
        <span>${grandTotal.toLocaleString("en-US")}</span>
      </div>
      <div className="mt-6">
        <AdminAttendeeTable households={households} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `AdminDashboard` 컴포넌트 작성**

Create `src/components/AdminDashboard.tsx`:
```tsx
import { useTranslations } from "next-intl";
import { formatUSD } from "@/lib/fees";
import type { DashboardStats } from "@/lib/dashboard";

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-sm font-semibold text-slate-500">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div>
      <div className={`text-2xl font-bold ${accent ?? "text-slate-900"}`}>
        {value}
      </div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

export function AdminDashboard({ stats }: { stats: DashboardStats }) {
  const t = useTranslations("Admin");
  const tl = useTranslations("Language");
  const td = useTranslations("District");
  const tr = useTranslations("Role");

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card title={t("dashRegistration")}>
        <div className="grid grid-cols-3 gap-3">
          <Stat label={t("dashTotal")} value={stats.totalPeople} />
          <Stat label={t("dashHouseholds")} value={stats.households} />
          <Stat label={t("under6")} value={stats.under6} />
          <Stat label={t("dashFull")} value={stats.full} />
          <Stat label={t("dashPartial")} value={stats.partial} />
        </div>
      </Card>

      <Card title={t("dashLanguage")}>
        <div className="grid grid-cols-3 gap-3">
          <Stat label={tl("ko")} value={stats.language.ko} />
          <Stat label={tl("en")} value={stats.language.en} />
          <Stat label={tl("es")} value={stats.language.es} />
        </div>
      </Card>

      <Card title={t("dashRooms")}>
        <div className="grid grid-cols-2 gap-3">
          <Stat label={t("dashAssigned")} value={stats.assigned} />
          <Stat
            label={t("dashUnassigned")}
            value={stats.unassigned}
            accent={stats.unassigned > 0 ? "text-amber-600" : undefined}
          />
        </div>
        <ul className="mt-3 space-y-1 text-sm text-slate-600">
          {stats.rooms.map((r) => (
            <li key={r.name} className="flex justify-between">
              <span>
                {r.name}{" "}
                <span className="text-slate-400">({r.roomCount})</span>
              </span>
              <span
                className={r.occupied > r.capacityTotal ? "text-rose-600" : ""}
              >
                {r.occupied}/{r.capacityTotal}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={t("dashFees")}>
        <div className="grid grid-cols-2 gap-3">
          <Stat label={t("dashExpected")} value={formatUSD(stats.grandTotal)} />
          <Stat
            label={t("dashPaid")}
            value={formatUSD(stats.paidTotal)}
            accent="text-emerald-600"
          />
          <Stat
            label={t("dashUnpaid")}
            value={formatUSD(stats.unpaidTotal)}
            accent={stats.unpaidTotal > 0 ? "text-amber-600" : undefined}
          />
          <Stat
            label={t("dashPaidHouseholds")}
            value={`${stats.paidHouseholds}/${stats.households}`}
          />
        </div>
      </Card>

      <Card title={t("dashByDistrict")}>
        <ul className="space-y-1 text-sm text-slate-600">
          {stats.byDistrict.length === 0 && (
            <li className="text-slate-400">—</li>
          )}
          {stats.byDistrict.map((d) => (
            <li key={d.key} className="flex justify-between">
              <span>{td(d.key)}</span>
              <span>{d.count}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={t("dashByRole")}>
        <ul className="space-y-1 text-sm text-slate-600">
          {stats.byRole.length === 0 && <li className="text-slate-400">—</li>}
          {stats.byRole.map((r) => (
            <li key={r.key} className="flex justify-between">
              <span>{tr(r.key)}</span>
              <span>{r.count}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: `/admin` 페이지를 대시보드로 교체**

`src/app/[locale]/admin/(protected)/page.tsx` 전체를 다음으로 교체:
```tsx
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AdminDashboard } from "@/components/AdminDashboard";
import { computeDashboard, type RoomForStats } from "@/lib/dashboard";
import type { AttendeeWithRoom } from "@/lib/fees";

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const [{ data: aData }, { data: rData }] = await Promise.all([
    supabase
      .from("attendees")
      .select("*, rooms(label, room_types(name, price_per_person))"),
    supabase.from("rooms").select("room_types(name, capacity)"),
  ]);

  const stats = computeDashboard(
    (aData as AttendeeWithRoom[] | null) ?? [],
    (rData as RoomForStats[] | null) ?? [],
  );

  const t = await getTranslations("Admin");

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{t("dashTitle")}</h1>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            {t("signOut")}
          </button>
        </form>
      </div>
      <div className="mt-6">
        <AdminDashboard stats={stats} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 서브내비 갱신 (`layout.tsx`)**

`src/app/[locale]/admin/(protected)/layout.tsx`의 서브내비 `<div className="mx-auto flex ...">` 안에서, 첫 링크(`/admin` navAttendees)를 다음 두 링크로 교체(나머지 rooms/assignments/schedule/faq 링크는 그대로 유지):
```tsx
          <Link href="/admin" className="text-slate-600 hover:text-slate-900">
            {tn("navDashboard")}
          </Link>
          <Link
            href="/admin/attendees"
            className="text-slate-600 hover:text-slate-900"
          >
            {tn("navAttendees")}
          </Link>
```
(기존 `<Link href="/admin">{tn("navAttendees")}</Link>` 한 줄을 위 두 줄로 대체.)

- [ ] **Step 5: i18n Admin 대시보드 키 추가**

`messages/ko.json`의 `Admin` 객체에 추가(기존 키 뒤, 콤마 주의):
```json
    "navDashboard": "대시보드",
    "dashTitle": "대시보드",
    "dashRegistration": "등록 현황",
    "dashTotal": "총 인원",
    "dashHouseholds": "가구",
    "dashFull": "전일 참석",
    "dashPartial": "부분 참석",
    "dashLanguage": "언어별 분포",
    "dashRooms": "방 배정 현황",
    "dashAssigned": "배정",
    "dashUnassigned": "미배정",
    "dashFees": "회비 현황",
    "dashExpected": "총 예상 회비",
    "dashPaid": "납부 완료",
    "dashUnpaid": "미납",
    "dashPaidHouseholds": "납부 가구",
    "dashByDistrict": "구역별",
    "dashByRole": "직분별"
```
`messages/en.json`의 `Admin` 객체에 동일 키:
```json
    "navDashboard": "Dashboard",
    "dashTitle": "Dashboard",
    "dashRegistration": "Registration",
    "dashTotal": "Total people",
    "dashHouseholds": "Households",
    "dashFull": "Full attendance",
    "dashPartial": "Partial",
    "dashLanguage": "By language",
    "dashRooms": "Room assignment",
    "dashAssigned": "Assigned",
    "dashUnassigned": "Unassigned",
    "dashFees": "Fees",
    "dashExpected": "Expected total",
    "dashPaid": "Paid",
    "dashUnpaid": "Unpaid",
    "dashPaidHouseholds": "Paid households",
    "dashByDistrict": "By district",
    "dashByRole": "By role"
```

- [ ] **Step 6: 검증 (tsc/lint/build + 파리티)**

Run:
```bash
npx tsc --noEmit && npm run lint
node -e 'const ko=require("./messages/ko.json"),en=require("./messages/en.json");const k=o=>Object.entries(o).flatMap(([a,v])=>typeof v==="object"&&v?Object.keys(v).map(x=>a+"."+x):[a]);const A=new Set(k(ko)),B=new Set(k(en));const x=[...A].filter(y=>!B.has(y)),z=[...B].filter(y=>!A.has(y));if(x.length||z.length){console.error("MISMATCH",{x,z});process.exit(1)}console.log("OK keys",A.size)'
npm run build
```
Expected: tsc/lint 오류 없음, `OK keys <N>`, build 성공(`/[locale]/admin`·`/[locale]/admin/attendees` 라우트 존재).

- [ ] **Step 7: Commit**

```bash
git add "src/app/[locale]/admin/(protected)/attendees/page.tsx" "src/app/[locale]/admin/(protected)/page.tsx" src/components/AdminDashboard.tsx "src/app/[locale]/admin/(protected)/layout.tsx" messages/ko.json messages/en.json
git commit -m "$(cat <<'EOF'
feat(phase4): /admin 대시보드 + 목록 /admin/attendees 이동 + 서브내비

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Spec coverage:**
- 언어 enum/컬럼/기본 ko/guard 보호 → Task 1 ✅
- 타입(Language, Attendee.language) → Task 2 ✅
- 관리자 언어 지정(setLanguage + 표 셀렉트 + Language i18n) → Task 3 ✅
- 집계(등록/언어/방배정/회비/보조) → Task 4 ✅
- 대시보드 카드 5종(+보조 2) → Task 5(AdminDashboard) ✅
- IA: /admin=대시보드, 목록 /admin/attendees, 서브내비 → Task 5 ✅
- 검증(마이그레이션/psql, 집계 로직, tsc/lint/build, 파리티) → 각 Task ✅
- 범위 밖(Spanish UI, 언어별 일정 태깅, 차트 라이브러리) → 미구현(의도) ✅

**2. Placeholder scan:** 없음. 모든 코드 스텝에 완전한 코드. guard 함수는 현재 본문 전체를 재작성(language 1줄 추가)로 명시.

**3. Type consistency:** `Language`/`LANGUAGES`(Task 2)가 Task 3(setLanguage·셀렉트)·Task 4(language 집계)에서 일치. `computeDashboard`/`RoomForStats`/`DashboardStats`(Task 4)가 Task 5 페이지·컴포넌트와 일치. i18n 키(`Language.{ko,en,es}`, `Admin.dash*`/`navDashboard`)가 사용처와 일치. 액션 시그니처 `setLanguage(id, language)` 일관. 쿼리 select(`rooms(label, room_types(name, price_per_person))` + `rooms→room_types(name, capacity)`)가 `AttendeeWithRoom`/`RoomForStats`와 정합.
