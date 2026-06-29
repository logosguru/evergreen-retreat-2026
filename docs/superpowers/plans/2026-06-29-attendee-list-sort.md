# 참석자 정렬 표 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 참석자 목록을 가구 카드에서 사람당 1행 정렬 표로 바꿔, 참석·방타입·언어 정렬과 구역 열을 추가한다.

**Architecture:** 정렬 로직을 순수 모듈 `lib/attendee-sort.ts`로 분리(테스트 용이). `AdminAttendeeTable`을 평탄 정렬 표로 재작성(클라이언트 정렬 상태), 페이지는 평탄 `attendees`를 전달. 회비·언어·납부 인라인 동작 유지.

**Tech Stack:** Next.js 16(App Router) · next-intl v4 · Tailwind v4 · TypeScript

## Global Constraints

- **클라이언트 정렬**: 표가 이미 `"use client"`. 서버 정렬·페이지네이션·검색은 범위 밖.
- **정렬 가능 = 참석·방(타입)·언어 3개만**. 헤더 클릭 asc↔desc, 활성 헤더에 ▲/▼. 기본=가구별 묶음(가구주→가구원 인접, 가구주 이름순).
- **방 정렬**: `rooms.room_types.name` 기준, **미배정(방 없음)은 asc/desc 무관 항상 맨 뒤**. 표시는 `rooms.label`(미배정은 `Rooms.unassigned`).
- **참석 정렬**: full=0 < partial=1 (asc=전일 먼저). **언어 정렬**: `LANGUAGES` 인덱스(ko<en<es). 동순위 tiebreak=`korean_name`.
- **구역 열**: `district`(라벨 `District`), 표시 전용(정렬 대상 아님). 없으면 "—".
- **회비·납부 유지**: 회비=`personFee`(6세미만 면제·미배정 미산정, `Fee.exempt/pending`). 납부=가구 단위 — 행의 가구주 `paid`를 `setPaid(headId, !paid)`로 토글(가구원 행에서도 같은 가구).
- **언어 셀렉트**: 기존 `setLanguage(id, language)` 인라인 유지.
- **i18n**: 헤더는 기존 `Admin.col*` 재사용 + 신규 `colRoom/colLanguage/colPayment`. 값 라벨은 `Role/District/Attendance/Language/Fee` 재사용. ko/en 파리티.
- **검증 도구**(단위 테스트 러너 없음): `npx tsc --noEmit`, `npm run lint`, `npm run build`, node 로직 체크, 키 파리티. 관리자 브라우저 확인은 컨트롤러 통합.
- **커밋 메시지** 말미: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- 작업 브랜치: `attendee-list-sort` (이미 생성됨).

---

### Task 1: i18n — 컬럼 헤더 키 3개

**Files:**
- Modify: `messages/ko.json`, `messages/en.json`

**Interfaces:**
- Produces: `Admin.colRoom`, `Admin.colLanguage`, `Admin.colPayment` (ko/en).

- [ ] **Step 1: `messages/ko.json`의 `Admin` 객체에 추가**

기존 `"colPaid": "회비",` 줄 다음에 추가:
```json
    "colRoom": "방",
    "colLanguage": "언어",
    "colPayment": "납부",
```

- [ ] **Step 2: `messages/en.json`의 `Admin` 객체에 추가**

(en의 colPaid는 `"Fee"` 등 기존 값) 같은 위치에:
```json
    "colRoom": "Room",
    "colLanguage": "Language",
    "colPayment": "Payment",
```

- [ ] **Step 3: JSON 유효성 + ko/en 파리티**

Run:
```bash
node -e 'const ko=require("./messages/ko.json"),en=require("./messages/en.json");const k=o=>Object.entries(o).flatMap(([a,v])=>typeof v==="object"&&v?Object.keys(v).map(x=>a+"."+x):[a]);const A=new Set(k(ko)),B=new Set(k(en));const x=[...A].filter(y=>!B.has(y)),z=[...B].filter(y=>!A.has(y));if(x.length||z.length){console.error("MISMATCH",{x,z});process.exit(1)}console.log("OK keys",A.size)'
```
Expected: `OK keys <N>` (불일치 시 실패).

- [ ] **Step 4: Commit**

```bash
git add messages/ko.json messages/en.json
git commit -m "$(cat <<'EOF'
feat(attendees): 정렬 표 컬럼 헤더 i18n(colRoom/colLanguage/colPayment)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 정렬 순수 모듈 — `lib/attendee-sort.ts`

**Files:**
- Create: `src/lib/attendee-sort.ts`

**Interfaces:**
- Consumes: `LANGUAGES`(`types.ts`), `AttendeeWithRoom`(`fees.ts`).
- Produces:
  - `type SortKey = "attendance" | "room" | "language"`
  - `interface SortState { key: SortKey | null; dir: "asc" | "desc" }`
  - `buildHeads(rows: AttendeeWithRoom[]): Map<string, AttendeeWithRoom>` — 가구주 id→가구주 행
  - `headOf(a: AttendeeWithRoom, heads): AttendeeWithRoom | undefined` — 행의 가구주(본인이 가구주면 본인)
  - `sortAttendees(rows: AttendeeWithRoom[], sort: SortState): AttendeeWithRoom[]` — 정렬된 새 배열

- [ ] **Step 1: 작성**

Create `src/lib/attendee-sort.ts`:
```ts
import { LANGUAGES } from "./types";
import type { AttendeeWithRoom } from "./fees";

export type SortKey = "attendance" | "room" | "language";
export interface SortState {
  key: SortKey | null;
  dir: "asc" | "desc";
}

const LANG_INDEX: Record<string, number> = Object.fromEntries(
  LANGUAGES.map((l, i) => [l, i]),
);

// 가구주 id → 가구주 행
export function buildHeads(
  rows: AttendeeWithRoom[],
): Map<string, AttendeeWithRoom> {
  const m = new Map<string, AttendeeWithRoom>();
  for (const r of rows) if (r.is_householder) m.set(r.id, r);
  return m;
}

// 행의 가구주(본인이 가구주면 본인). 못 찾으면 undefined.
export function headOf(
  a: AttendeeWithRoom,
  heads: Map<string, AttendeeWithRoom>,
): AttendeeWithRoom | undefined {
  const id = a.is_householder ? a.id : a.householder_id;
  return id ? heads.get(id) : undefined;
}

const nm = (a: AttendeeWithRoom) => a.korean_name;

// 기본(묶음): [가구주이름, 가구주먼저, created_at]
function compareDefault(
  a: AttendeeWithRoom,
  b: AttendeeWithRoom,
  heads: Map<string, AttendeeWithRoom>,
): number {
  const ha = headOf(a, heads)?.korean_name ?? a.korean_name;
  const hb = headOf(b, heads)?.korean_name ?? b.korean_name;
  return (
    ha.localeCompare(hb) ||
    Number(b.is_householder) - Number(a.is_householder) ||
    a.created_at.localeCompare(b.created_at)
  );
}

// 활성 키 asc 비교(미배정 처리는 sortAttendees에서 별도). tiebreak=이름.
function compareKey(
  a: AttendeeWithRoom,
  b: AttendeeWithRoom,
  key: SortKey,
): number {
  if (key === "attendance") {
    const o = (x: AttendeeWithRoom) => (x.attendance === "full" ? 0 : 1);
    return o(a) - o(b) || nm(a).localeCompare(nm(b));
  }
  if (key === "language") {
    return (
      (LANG_INDEX[a.language] ?? 99) - (LANG_INDEX[b.language] ?? 99) ||
      nm(a).localeCompare(nm(b))
    );
  }
  // room: 방 타입 이름 → 호실 라벨 → 이름
  const ta = a.rooms?.room_types?.name ?? null;
  const tb = b.rooms?.room_types?.name ?? null;
  if (ta == null && tb == null) return nm(a).localeCompare(nm(b));
  if (ta == null) return 1;
  if (tb == null) return -1;
  return (
    ta.localeCompare(tb) ||
    (a.rooms?.label ?? "").localeCompare(b.rooms?.label ?? "") ||
    nm(a).localeCompare(nm(b))
  );
}

export function sortAttendees(
  rows: AttendeeWithRoom[],
  sort: SortState,
): AttendeeWithRoom[] {
  const out = [...rows];
  if (sort.key == null) {
    const heads = buildHeads(rows);
    out.sort((a, b) => compareDefault(a, b, heads));
    return out;
  }
  const key = sort.key;
  const sign = sort.dir === "desc" ? -1 : 1;
  out.sort((a, b) => {
    if (key === "room") {
      // 미배정은 dir 무관 항상 맨 뒤
      const ua = a.rooms?.room_types?.name == null ? 1 : 0;
      const ub = b.rooms?.room_types?.name == null ? 1 : 0;
      if (ua !== ub) return ua - ub;
    }
    return sign * compareKey(a, b, key);
  });
  return out;
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 3: 정렬 로직 런타임 검증 (순수 JS 복제)**

Run:
```bash
node -e '
const LANG=["ko","en","es"]; const LI=Object.fromEntries(LANG.map((l,i)=>[l,i]));
const nm=a=>a.korean_name;
function cmpKey(a,b,key){
  if(key==="attendance"){const o=x=>x.attendance==="full"?0:1;return o(a)-o(b)||nm(a).localeCompare(nm(b));}
  if(key==="language"){return (LI[a.language]??99)-(LI[b.language]??99)||nm(a).localeCompare(nm(b));}
  const ta=a.rooms?.room_types?.name??null, tb=b.rooms?.room_types?.name??null;
  if(ta==null&&tb==null)return nm(a).localeCompare(nm(b));
  if(ta==null)return 1; if(tb==null)return -1;
  return ta.localeCompare(tb)||(a.rooms?.label??"").localeCompare(b.rooms?.label??"")||nm(a).localeCompare(nm(b));
}
function sortBy(rows,key,dir){const sign=dir==="desc"?-1:1;return [...rows].sort((a,b)=>{
  if(key==="room"){const ua=a.rooms?.room_types?.name==null?1:0,ub=b.rooms?.room_types?.name==null?1:0; if(ua!==ub)return ua-ub;}
  return sign*cmpKey(a,b,key);});}
const R=(t,l)=>({rooms:{label:l,room_types:{name:t}}});
const data=[
 {korean_name:"A",attendance:"partial",language:"es",...R("2인실","201")},
 {korean_name:"B",attendance:"full",language:"ko",...R("4인실","401")},
 {korean_name:"C",attendance:"full",language:"en",rooms:null},
 {korean_name:"D",attendance:"partial",language:"ko",...R("2인실","202")},
];
const names=rows=>rows.map(nm).join(",");
console.log("room asc :",names(sortBy(data,"room","asc")));
console.log("room desc:",names(sortBy(data,"room","desc")));
console.log("att asc  :",names(sortBy(data,"attendance","asc")));
console.log("lang asc :",names(sortBy(data,"language","asc")));
'
```
Expected:
```
room asc : A,D,B,C
room desc: B,D,A,C
att asc  : B,C,A,D
lang asc : B,D,C,A
```
(방 asc=2인실 201·202→4인실→미배정 맨뒤; 방 desc=4인실→2인실(202·201)→미배정 여전히 맨뒤; 참석 asc=전일 먼저; 언어 ko→en→es.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/attendee-sort.ts
git commit -m "$(cat <<'EOF'
feat(attendees): 정렬 순수 모듈(attendee-sort) — 참석/방타입/언어 + 가구 묶음 기본

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `AdminAttendeeTable` 평탄 정렬 표 + 페이지 prop

**Files:**
- Modify: `src/components/AdminAttendeeTable.tsx` (전면 교체)
- Modify: `src/app/[locale]/admin/(protected)/attendees/page.tsx` (표 prop 변경)

**Interfaces:**
- Consumes: `sortAttendees`/`buildHeads`/`headOf`/`SortKey`/`SortState`(Task 2), `Admin.col*`+신규 키(Task 1), `setPaid`/`setLanguage`, `personFee`/`formatUSD`/`AttendeeWithRoom`, `LANGUAGES`/`Language`.

- [ ] **Step 1: `AdminAttendeeTable.tsx` 전체 교체**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { setPaid, setLanguage } from "@/app/[locale]/admin/actions";
import { LANGUAGES, type Language } from "@/lib/types";
import { personFee, formatUSD, type AttendeeWithRoom } from "@/lib/fees";
import {
  sortAttendees,
  buildHeads,
  headOf,
  type SortKey,
  type SortState,
} from "@/lib/attendee-sort";

export function AdminAttendeeTable({
  attendees,
}: {
  attendees: AttendeeWithRoom[];
}) {
  const t = useTranslations("Admin");
  const tr = useTranslations("Role");
  const td = useTranslations("District");
  const ta = useTranslations("Attendance");
  const tf = useTranslations("Fee");
  const trm = useTranslations("Rooms");
  const tl = useTranslations("Language");
  const router = useRouter();
  const [, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  }

  function arrow(key: SortKey) {
    if (sort.key !== key) return "";
    return sort.dir === "asc" ? " ▲" : " ▼";
  }

  function changeLang(id: string, language: Language) {
    start(async () => {
      await setLanguage(id, language);
      router.refresh();
    });
  }

  function togglePaid(headId: string, current: boolean) {
    setBusy(headId);
    start(async () => {
      await setPaid(headId, !current);
      setBusy(null);
      router.refresh();
    });
  }

  function feeText(a: AttendeeWithRoom) {
    const f = personFee(a);
    if (a.is_under_6) return tf("exempt");
    if (f == null) return tf("pending");
    return formatUSD(f);
  }

  if (attendees.length === 0) {
    return (
      <p className="rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-600">
        {t("empty")}
      </p>
    );
  }

  const heads = buildHeads(attendees);
  const rows = sortAttendees(attendees, sort);

  function SortTh({ k, label }: { k: SortKey; label: string }) {
    return (
      <th className="px-3 py-2 text-left font-medium">
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className="inline-flex items-center gap-0.5 hover:text-slate-900"
        >
          {label}
          <span className="text-emerald-600">{arrow(k)}</span>
        </button>
      </th>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
      <table className="min-w-full divide-y divide-slate-100 bg-white text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left font-medium">{t("colName")}</th>
            <th className="px-3 py-2 text-left font-medium">
              {t("colHousehold")}
            </th>
            <th className="px-3 py-2 text-left font-medium">{t("colRole")}</th>
            <th className="px-3 py-2 text-left font-medium">
              {t("colDistrict")}
            </th>
            <SortTh k="attendance" label={t("colAttendance")} />
            <SortTh k="room" label={t("colRoom")} />
            <SortTh k="language" label={t("colLanguage")} />
            <th className="px-3 py-2 text-right font-medium">{t("colPaid")}</th>
            <th className="px-3 py-2 text-left font-medium">
              {t("colPayment")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((a) => {
            const head = headOf(a, heads);
            const headId = head?.id ?? a.id;
            const headPaid = head?.paid ?? a.paid;
            return (
              <tr key={a.id}>
                <td className="px-3 py-2">
                  <span className="font-medium text-slate-900">
                    {a.korean_name}
                  </span>
                  {a.is_under_6 && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                      {t("under6")}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {head?.korean_name ?? a.korean_name}
                  {a.is_householder && (
                    <span className="ml-1 text-xs text-slate-400">
                      ({t("householder")})
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {a.role ? tr(a.role) : "—"}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {a.district ? td(a.district) : "—"}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={
                      a.attendance === "partial"
                        ? "rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-700"
                        : "rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600"
                    }
                  >
                    {ta(a.attendance)}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {a.rooms?.label ?? trm("unassigned")}
                </td>
                <td className="px-3 py-2">
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
                <td className="px-3 py-2 text-right text-slate-700">
                  {feeText(a)}
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    disabled={busy === headId}
                    onClick={() => togglePaid(headId, headPaid)}
                    className={
                      headPaid
                        ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-200 disabled:opacity-60"
                        : "rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-300 disabled:opacity-60"
                    }
                  >
                    {headPaid ? tf("paid") : tf("unpaid")}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: 페이지 prop 변경**

`src/app/[locale]/admin/(protected)/attendees/page.tsx`에서 표 렌더 한 줄을 교체. 기존:
```tsx
        <AdminAttendeeTable households={households} />
```
변경:
```tsx
        <AdminAttendeeTable attendees={attendees} />
```
(나머지는 그대로: `attendees`/`households`/`grandTotal`/`paidHouseholds` 계산과 요약줄은 유지 — 요약줄은 `households` 사용.)

- [ ] **Step 3: 타입체크 + 린트 + 빌드**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 오류 없음. `/[locale]/admin/attendees` 컴파일.

- [ ] **Step 4: 기능 확인 (브라우저 — 관리자)**

`npm run dev` + 관리자 로그인. `http://localhost:3000/admin/attendees`:
- 표가 사람당 1행으로 표시(이름·가구·직분·구역·참석·방·언어·회비·납부).
- 참석/방/언어 헤더 클릭 → 정렬(▲/▼), 재클릭 → 역순. 미배정은 방 정렬 시 항상 맨 아래.
- 언어 셀렉트 변경 → 저장 후 갱신. 납부 배지 클릭 → 해당 가구 토글(가구원 행에서도 동일 가구).
- 기본 화면은 가구별로 묶여 보임.

- [ ] **Step 5: Commit**

```bash
git add src/components/AdminAttendeeTable.tsx "src/app/[locale]/admin/(protected)/attendees/page.tsx"
git commit -m "$(cat <<'EOF'
feat(attendees): 참석자 평탄 정렬 표(참석/방/언어 정렬 + 구역 열, 회비·납부·언어 인라인)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Spec coverage:**
- 평탄 표 교체 + 요약줄 유지 → Task 3 ✅
- 정렬(참석/방타입/언어, asc↔desc, 미배정 맨뒤, 기본 가구묶음) → Task 2(로직) + Task 3(헤더) ✅
- 구역 열(표시 전용) → Task 3 ✅
- 회비·납부 둘 다 + 언어 셀렉트 인라인 → Task 3 ✅
- i18n 헤더 키(재사용 + colRoom/colLanguage/colPayment) → Task 1 ✅
- 검증(정렬 node 체크, tsc/lint/build, 파리티) → Task 1·2·3 ✅
- 범위 밖(서버정렬/페이지네이션/검색/별도 기관 필드) → 미구현(의도) ✅

**2. Placeholder scan:** 없음. 모든 코드 스텝 완전한 코드.

**3. Type consistency:** `SortKey`/`SortState`/`sortAttendees`/`buildHeads`/`headOf`(Task 2)가 Task 3 사용처와 일치. props 변경(`households`→`attendees: AttendeeWithRoom[]`)이 페이지(Task 3 Step 2)와 컴포넌트(Step 1) 양쪽 반영. i18n 키(`colRoom/colLanguage/colPayment` + 기존 col*) 정의(Task 1)·사용(Task 3) 일치. `setPaid`/`setLanguage`/`personFee`/`formatUSD`/`LANGUAGES`는 기존 export 재사용.
