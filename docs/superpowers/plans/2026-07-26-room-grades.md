# 객실 등급(Grade) 세분화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 화면(객실 관리·방배치)에 물리 객실 등급(Premium 무제한 / Luxury 합산 10 / Junior suite 2)과 침대 개수(single=1/double=2)를 도입하고 등급별 쿼터를 DB로 관리한다. 공개 화면(등록/본인수정/회비)은 기존 2/3/4인실만 그대로 노출.

**Architecture:** 새 관리자 전용 테이블 `room_grades`(토큰 name + quota, null=무제한, 고정 3행 시드·CRUD 없음·쿼터만 수정) + `rooms.grade_id`/`bed_type` 컬럼. 기존 `room_types`(2/3/4인실)는 회비 타입으로 유지되어 회비·대시보드·정렬 로직 무변경. 쿼터 집계는 순수 함수 `gradeUsage()`(호실 개수 기준, 초과 시 경고 배지만).

**Tech Stack:** Next.js 16 App Router, Supabase(Postgres/RLS), next-intl v4, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-07-26-room-grades-design.md`

## Global Constraints

- DB엔 영문 토큰만 저장 (`premium`/`luxury`/`junior_suite`, `single`/`double`) — 화면 라벨은 messages 번역. DB에 표시 문자열 저장 금지.
- **bed_type = 침대 개수** (single=침대 1개, double=침대 2개, 침대 크기 아님). 라벨에 개수 병기.
- i18n은 **ko/en/es 3개 파일 모두** 같은 키로 추가 (es 누락 시 스페인어 화면 깨짐).
- `useTranslations`는 컴포넌트 상단에서만 호출 (콜백 안 금지).
- `room_grades`는 관리자 전용 RLS(anon 정책 없음) — 성도 화면·쿼리에 절대 노출 금지. 공개 등록/수정/회비 코드는 이 계획에서 건드리지 않는다.
- 이 프로젝트는 테스트 러너가 없음 — 각 태스크의 검증은 `npx tsc --noEmit` + 마지막 태스크의 lint/build/로컬 실동작 확인 (빌드 통과 ≠ 런타임 정상).
- Next.js 16 사용 — 새 API 쓰기 전 `node_modules/next/dist/docs/` 확인 (이 계획은 기존 파일 패턴만 따르므로 신규 API 없음).
- 커밋 메시지 말미: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: DB 마이그레이션 0022 + 타입 상수

**Files:**
- Create: `supabase/migrations/0022_room_grades.sql`
- Modify: `src/lib/types.ts` (PICKUP_LOCATIONS 블록 아래 + `Room` 인터페이스)

**Interfaces:**
- Produces: `BED_TYPES: readonly ["single","double"]`, `type BedType`, `interface RoomGrade { id; name; quota: number | null; sort_order; created_at }`, `Room.grade_id: string`, `Room.bed_type: BedType` — 이후 모든 태스크가 사용.

- [ ] **Step 1: 마이그레이션 작성**

`supabase/migrations/0022_room_grades.sql` 생성 (enum 타입명은 0020의 `_t` 접미사 패턴):

```sql
-- =====================================================================
-- 객실 등급 (관리자 전용): Premium(무제한) / Luxury(double+single 합산 10) / Junior suite(2)
-- - bed_type = 침대 "개수" (single=1개, double=2개). 침대 크기 아님.
-- - 등급은 고정 3행 시드, CRUD 없음. 쿼터 숫자만 관리자가 수정.
-- - room_types(2/3/4인실)는 성도 대면 회비 타입으로 그대로 유지 — 여기와 무관.
-- =====================================================================
create type public.bed_type_t as enum ('single', 'double');

create table public.room_grades (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,       -- 토큰: premium/luxury/junior_suite (라벨은 i18n)
  quota      int check (quota >= 0),     -- null = 무제한
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.room_grades (name, quota, sort_order) values
  ('premium', null, 1),
  ('luxury', 10, 2),
  ('junior_suite', 2, 3);

alter table public.rooms
  add column grade_id uuid references public.room_grades(id) on delete restrict,
  add column bed_type public.bed_type_t not null default 'double';

-- 기존 호실 backfill: 전부 Premium (관리자가 이후 화면에서 수정)
update public.rooms
  set grade_id = (select id from public.room_grades where name = 'premium');
alter table public.rooms alter column grade_id set not null;

-- RLS: rooms와 동일 — 관리자 전용, anon 정책 없음 (성도 완전 비노출)
alter table public.room_grades enable row level security;
create policy "room_grades_admin" on public.room_grades
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
```

- [ ] **Step 2: 로컬 Supabase에 적용 확인**

Run: `supabase migration up` (로컬 스택이 안 떠 있으면 먼저 `supabase start`)
Expected: `Applying migration 0022_room_grades.sql...` 후 오류 없음.
확인:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -c "select name, quota, sort_order from public.room_grades order by sort_order" \
  -c "\d public.rooms"
```

Expected: premium(quota NULL)/luxury(10)/junior_suite(2) 3행 + rooms에 `grade_id | uuid | not null`, `bed_type | bed_type_t | not null default 'double'`.

- [ ] **Step 3: types.ts에 상수·타입 추가**

`src/lib/types.ts`의 `PICKUP_LOCATIONS` 블록(46-47행 부근) 아래에 추가:

```ts
// 객실 등급/침대 (관리자 전용). bed_type은 침대 "개수": single=1, double=2.
// 등급 라벨은 i18n "Rooms.grade", 침대 라벨은 "Rooms.bed"에서 번역.
export const BED_TYPES = ["single", "double"] as const;
export type BedType = (typeof BED_TYPES)[number];

export interface RoomGrade {
  id: string;
  name: string; // 토큰: premium | luxury | junior_suite
  quota: number | null; // 보유 호실 수량. null = 무제한 (Premium)
  sort_order: number;
  created_at: string;
}
```

`Room` 인터페이스의 `room_type_id: string;` 다음 줄에 추가:

```ts
  grade_id: string; // 객실 등급 (관리자 전용)
  bed_type: BedType; // 침대 개수: single=1, double=2
```

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 오류 0건. (Room을 만들어 넘기는 곳은 전부 DB select 결과 캐스팅이라 컴파일 영향 없음)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0022_room_grades.sql src/lib/types.ts
git commit -m "feat(db): room_grades 테이블(등급별 쿼터) + rooms.grade_id/bed_type

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 쿼터 집계 순수 함수 `lib/rooms.ts`

**Files:**
- Create: `src/lib/rooms.ts`

**Interfaces:**
- Consumes: Task 1의 `Room`, `RoomGrade`.
- Produces: `interface GradeUsage { used: number; quota: number | null; over: boolean }`, `gradeUsage(grades: RoomGrade[], rooms: Pick<Room, "grade_id">[]): Map<string, GradeUsage>` — Task 4(RoomManager)·Task 5(AssignmentBoard)가 사용. Map 키는 `grade.id`.

- [ ] **Step 1: 파일 작성**

`src/lib/rooms.ts` 생성:

```ts
import type { Room, RoomGrade } from "@/lib/types";

// 등급별 쿼터 사용 현황. "호실 개수" 기준 — 리조트가 방 단위로 잡아준 수량이므로
// 배정 인원과 무관. 쿼터 초과는 경고 표시용일 뿐 생성을 막지 않는다.
export interface GradeUsage {
  used: number;
  quota: number | null; // null = 무제한
  over: boolean;
}

export function gradeUsage(
  grades: RoomGrade[],
  rooms: Pick<Room, "grade_id">[],
): Map<string, GradeUsage> {
  const usage = new Map<string, GradeUsage>();
  for (const g of grades) {
    const used = rooms.filter((r) => r.grade_id === g.id).length;
    usage.set(g.id, {
      used,
      quota: g.quota,
      over: g.quota != null && used > g.quota,
    });
  }
  return usage;
}
```

- [ ] **Step 2: 임시 스크립트로 동작 확인**

테스트 러너가 없으므로 repo 루트에 임시 스크립트를 만들어 검증 (상대 import가 동작하도록 루트에 생성; `assert`는 실패 시 throw):

```bash
cat > grade-usage-check.tmp.ts <<'EOF'
import assert from "node:assert/strict";
import { gradeUsage } from "./src/lib/rooms";
const grades = [
  { id: "p", name: "premium", quota: null, sort_order: 1, created_at: "" },
  { id: "l", name: "luxury", quota: 2, sort_order: 2, created_at: "" },
];
const rooms = [{ grade_id: "l" }, { grade_id: "l" }, { grade_id: "l" }, { grade_id: "p" }];
const u = gradeUsage(grades, rooms);
assert.deepEqual(u.get("p"), { used: 1, quota: null, over: false });
assert.deepEqual(u.get("l"), { used: 3, quota: 2, over: true });
console.log("OK");
EOF
npx --yes tsx grade-usage-check.tmp.ts && rm grade-usage-check.tmp.ts
```

Expected: `OK` 출력 후 파일 삭제. (실패 시 AssertionError로 비정상 종료 — 파일이 남으므로 수정 후 재실행)

- [ ] **Step 3: 타입체크 + Commit**

Run: `npx tsc --noEmit` → 오류 0건.

```bash
git add src/lib/rooms.ts
git commit -m "feat: 등급별 쿼터 사용 집계 순수 함수 gradeUsage()

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 서버 액션 — updateGradeQuota 신설

**Files:**
- Modify: `src/app/[locale]/admin/rooms-actions.ts`

**Interfaces:**
- Produces: `updateGradeQuota(id: string, quota: number | null): Promise<{ ok: boolean }>` — Task 4가 호출.
- 참고: `upsertRoom` 시그니처 변경(grade_id/bed_type)은 호출부(RoomManager)와 같은 커밋이어야 tsc가 깨지지 않으므로 **Task 4에서** 진행.

- [ ] **Step 1: updateGradeQuota 신설**

파일 끝에 추가 (권한은 room_grades 관리자 RLS가 보호 — 기존 패턴과 동일):

```ts
export async function updateGradeQuota(
  id: string,
  quota: number | null,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("room_grades")
    .update({ quota })
    .eq("id", id);
  revalidatePath("/[locale]/admin/rooms", "page");
  revalidatePath("/[locale]/admin/assignments", "page");
  return { ok: !error };
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 오류 0건.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/admin/rooms-actions.ts"
git commit -m "feat(admin): 등급 쿼터 수정 액션 updateGradeQuota

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: i18n 키 + upsertRoom 확장 + `/admin/rooms` (RoomManager 등급 UI)

**Files:**
- Modify: `messages/ko.json`, `messages/en.json`, `messages/es.json` (`Rooms` 네임스페이스)
- Modify: `src/app/[locale]/admin/rooms-actions.ts` (`upsertRoom`)
- Modify: `src/components/RoomManager.tsx`
- Modify: `src/app/[locale]/admin/(protected)/rooms/page.tsx`

**Interfaces:**
- Consumes: Task 1 `RoomGrade`/`BED_TYPES`/`BedType`, Task 2 `gradeUsage`, Task 3 `updateGradeQuota`.
- Produces: `upsertRoom(input: { id?; label; room_type_id; grade_id: string; bed_type: BedType; note?; sort_order? })`.
- Produces: `RoomManager` props가 `{ grades: RoomGrade[]; roomTypes: RoomType[]; rooms: Room[] }`로 변경. i18n `Rooms.grade.*`/`Rooms.bed.*`/`grades`/`bedType`/`quota`/`unlimited`/`gradeUsage`/`gradeUsageUnlimited`/`quotaOver` 키 — Task 5도 이 키들을 사용.

- [ ] **Step 1: i18n 키 추가 (3개 파일 모두)**

`messages/ko.json`의 `Rooms`에 추가 + `roomTypes` 값 교체:

```json
"roomTypes": "회비 타입 (성도 화면용)",
"grades": "객실 등급",
"grade": { "premium": "Premium", "luxury": "Luxury", "junior_suite": "Junior Suite" },
"bed": { "single": "싱글 (침대 1개)", "double": "더블 (침대 2개)" },
"bedType": "침대",
"quota": "쿼터",
"unlimited": "무제한",
"gradeUsage": "사용 {used} / {quota}",
"gradeUsageUnlimited": "사용 {used}",
"quotaOver": "초과"
```

`messages/en.json`:

```json
"roomTypes": "Fee types (member-facing)",
"grades": "Room grades",
"grade": { "premium": "Premium", "luxury": "Luxury", "junior_suite": "Junior Suite" },
"bed": { "single": "Single (1 bed)", "double": "Double (2 beds)" },
"bedType": "Beds",
"quota": "Quota",
"unlimited": "Unlimited",
"gradeUsage": "{used} / {quota} used",
"gradeUsageUnlimited": "{used} used",
"quotaOver": "Over quota"
```

`messages/es.json`:

```json
"roomTypes": "Tipos de cuota (visible para miembros)",
"grades": "Categorías de habitación",
"grade": { "premium": "Premium", "luxury": "Luxury", "junior_suite": "Junior Suite" },
"bed": { "single": "Individual (1 cama)", "double": "Doble (2 camas)" },
"bedType": "Camas",
"quota": "Cupo",
"unlimited": "Ilimitado",
"gradeUsage": "{used} / {quota} en uso",
"gradeUsageUnlimited": "{used} en uso",
"quotaOver": "Cupo excedido"
```

- [ ] **Step 2: upsertRoom에 grade_id·bed_type 추가**

`src/app/[locale]/admin/rooms-actions.ts` 상단에 import 추가:

```ts
import type { BedType } from "@/lib/types";
```

`upsertRoom`을 다음으로 교체:

```ts
export async function upsertRoom(input: {
  id?: string;
  label: string;
  room_type_id: string;
  grade_id: string;
  bed_type: BedType;
  note?: string;
  sort_order?: number;
}): Promise<Result> {
  const supabase = await createClient();
  const row = {
    label: input.label.trim(),
    room_type_id: input.room_type_id,
    grade_id: input.grade_id,
    bed_type: input.bed_type,
    note: input.note?.trim() || null,
    sort_order: input.sort_order ?? 0,
  };
  const { error } = input.id
    ? await supabase.from("rooms").update(row).eq("id", input.id)
    : await supabase.from("rooms").insert(row);
  revalidatePath("/[locale]/admin/rooms", "page");
  return { ok: !error };
}
```

- [ ] **Step 3: rooms/page.tsx에서 room_grades 조회 추가**

`src/app/[locale]/admin/(protected)/rooms/page.tsx`의 Promise.all을 3개 조회로 확장하고 RoomManager에 전달:

```tsx
import type { Room, RoomGrade, RoomType } from "@/lib/types";
// ...
  const [{ data: grades }, { data: roomTypes }, { data: rooms }] =
    await Promise.all([
      supabase.from("room_grades").select("*").order("sort_order"),
      supabase.from("room_types").select("*").order("sort_order"),
      supabase.from("rooms").select("*").order("sort_order"),
    ]);
// ...
      <RoomManager
        grades={(grades as RoomGrade[] | null) ?? []}
        roomTypes={(roomTypes as RoomType[] | null) ?? []}
        rooms={(rooms as Room[] | null) ?? []}
      />
```

- [ ] **Step 4: RoomManager 개편**

`src/components/RoomManager.tsx`를 다음으로 교체 (기존 회비 타입 섹션은 유지, 등급 섹션 신설 + 호실 폼/목록 확장):

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { BedType, Room, RoomGrade, RoomType } from "@/lib/types";
import { BED_TYPES } from "@/lib/types";
import { formatUSD } from "@/lib/fees";
import { gradeUsage } from "@/lib/rooms";
import {
  upsertRoomType,
  deleteRoomType,
  upsertRoom,
  deleteRoom,
  updateGradeQuota,
} from "@/app/[locale]/admin/rooms-actions";

const input =
  "rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

export function RoomManager({
  grades,
  roomTypes,
  rooms,
}: {
  grades: RoomGrade[];
  roomTypes: RoomType[];
  rooms: Room[];
}) {
  const t = useTranslations("Rooms");
  const router = useRouter();
  const [, start] = useTransition();

  // 등급 쿼터 입력 (빈값 = 무제한)
  const [quotaDraft, setQuotaDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(grades.map((g) => [g.id, g.quota?.toString() ?? ""])),
  );
  // 새 객실 타입 입력
  const [tName, setTName] = useState("");
  const [tCap, setTCap] = useState(4);
  const [tPrice, setTPrice] = useState(200);
  // 새 호실 입력
  const [rLabel, setRLabel] = useState("");
  const [rType, setRType] = useState("");
  const [rGrade, setRGrade] = useState(grades[0]?.id ?? "");
  const [rBed, setRBed] = useState<BedType>("double");

  const usage = gradeUsage(grades, rooms);

  function refresh() {
    router.refresh();
  }

  function saveQuota(g: RoomGrade) {
    const draft = quotaDraft[g.id]?.trim() ?? "";
    start(async () => {
      await updateGradeQuota(g.id, draft === "" ? null : Number(draft));
      refresh();
    });
  }

  function addType() {
    if (!tName.trim()) return;
    start(async () => {
      await upsertRoomType({
        name: tName,
        capacity: tCap,
        price_per_person: tPrice,
        sort_order: roomTypes.length + 1,
      });
      setTName("");
      refresh();
    });
  }

  function addRoom() {
    if (!rLabel.trim() || !rType || !rGrade) return;
    start(async () => {
      await upsertRoom({
        label: rLabel,
        room_type_id: rType,
        grade_id: rGrade,
        bed_type: rBed,
        sort_order: rooms.length + 1,
      });
      setRLabel("");
      refresh();
    });
  }

  // 기존 호실의 등급/침대 인라인 수정 (나머지 필드는 그대로 재전송)
  function patchRoom(
    r: Room,
    patch: Partial<Pick<Room, "grade_id" | "bed_type">>,
  ) {
    start(async () => {
      await upsertRoom({
        id: r.id,
        label: r.label,
        room_type_id: r.room_type_id,
        grade_id: patch.grade_id ?? r.grade_id,
        bed_type: patch.bed_type ?? r.bed_type,
        note: r.note ?? undefined,
        sort_order: r.sort_order,
      });
      refresh();
    });
  }

  const typeName = (id: string) =>
    roomTypes.find((rt) => rt.id === id)?.name ?? "?";

  const usageBadge = (g: RoomGrade) => {
    const u = usage.get(g.id);
    if (!u) return null;
    return (
      <span
        className={
          u.over
            ? "rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700"
            : "rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
        }
      >
        {u.quota == null
          ? t("gradeUsageUnlimited", { used: u.used })
          : t("gradeUsage", { used: u.used, quota: u.quota })}
        {u.over ? ` · ${t("quotaOver")}` : ""}
      </span>
    );
  };

  return (
    <div className="space-y-10">
      {/* 객실 등급 (쿼터만 수정 가능, 등급 CRUD 없음) */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          {t("grades")}
        </h2>
        <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
          {grades.map((g) => (
            <li
              key={g.id}
              className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
            >
              <span className="w-28 font-medium text-slate-800">
                {t(`grade.${g.name}`)}
              </span>
              {usageBadge(g)}
              <span className="ml-auto flex items-center gap-2">
                <label className="text-xs text-slate-500">{t("quota")}</label>
                <input
                  className={`${input} w-20`}
                  type="number"
                  min={0}
                  placeholder={t("unlimited")}
                  value={quotaDraft[g.id] ?? ""}
                  onChange={(e) =>
                    setQuotaDraft((d) => ({ ...d, [g.id]: e.target.value }))
                  }
                />
                <button
                  onClick={() => saveQuota(g)}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  {t("save")}
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* 회비 타입 (성도 화면용 2/3/4인실) — 기존 그대로 */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          {t("roomTypes")}
        </h2>
        <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
          {roomTypes.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-500">{t("empty")}</li>
          )}
          {roomTypes.map((rt) => (
            <li
              key={rt.id}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <span className="text-slate-800">
                {rt.name} · {t("capacity")} {rt.capacity} ·{" "}
                {formatUSD(rt.price_per_person)}
              </span>
              <button
                onClick={() =>
                  start(async () => {
                    await deleteRoomType(rt.id);
                    refresh();
                  })
                }
                className="text-rose-600 hover:text-rose-700"
              >
                {t("delete")}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input
            className={input}
            placeholder={t("name")}
            value={tName}
            onChange={(e) => setTName(e.target.value)}
          />
          <input
            className={`${input} w-20`}
            type="number"
            min={1}
            value={tCap}
            onChange={(e) => setTCap(Number(e.target.value))}
          />
          <input
            className={`${input} w-24`}
            type="number"
            min={0}
            value={tPrice}
            onChange={(e) => setTPrice(Number(e.target.value))}
          />
          <button
            onClick={addType}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            {t("add")}
          </button>
        </div>
      </section>

      {/* 호실 — 등급별 그룹 + 등급/침대 인라인 수정 */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          {t("rooms")}
        </h2>
        {rooms.length === 0 && (
          <p className="rounded-lg px-3 py-2 text-sm text-slate-500 ring-1 ring-slate-200">
            {t("empty")}
          </p>
        )}
        <div className="space-y-4">
          {grades.map((g) => {
            const list = rooms.filter((r) => r.grade_id === g.id);
            if (list.length === 0) return null;
            return (
              <div key={g.id}>
                <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  {t(`grade.${g.name}`)} {usageBadge(g)}
                </h3>
                <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
                  {list.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
                    >
                      <span className="text-slate-800">
                        {r.label} · {typeName(r.room_type_id)}
                      </span>
                      <span className="ml-auto flex items-center gap-2">
                        <select
                          className={input}
                          value={r.grade_id}
                          onChange={(e) =>
                            patchRoom(r, { grade_id: e.target.value })
                          }
                        >
                          {grades.map((gg) => (
                            <option key={gg.id} value={gg.id}>
                              {t(`grade.${gg.name}`)}
                            </option>
                          ))}
                        </select>
                        <select
                          className={input}
                          value={r.bed_type}
                          onChange={(e) =>
                            patchRoom(r, {
                              bed_type: e.target.value as BedType,
                            })
                          }
                        >
                          {BED_TYPES.map((b) => (
                            <option key={b} value={b}>
                              {t(`bed.${b}`)}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() =>
                            start(async () => {
                              await deleteRoom(r.id);
                              refresh();
                            })
                          }
                          className="text-rose-600 hover:text-rose-700"
                        >
                          {t("delete")}
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input
            className={input}
            placeholder={t("label")}
            value={rLabel}
            onChange={(e) => setRLabel(e.target.value)}
          />
          <select
            className={input}
            value={rGrade}
            onChange={(e) => setRGrade(e.target.value)}
          >
            {grades.map((g) => (
              <option key={g.id} value={g.id}>
                {t(`grade.${g.name}`)}
              </option>
            ))}
          </select>
          <select
            className={input}
            value={rBed}
            onChange={(e) => setRBed(e.target.value as BedType)}
          >
            {BED_TYPES.map((b) => (
              <option key={b} value={b}>
                {t(`bed.${b}`)}
              </option>
            ))}
          </select>
          <select
            className={input}
            value={rType}
            onChange={(e) => setRType(e.target.value)}
          >
            <option value="">{t("type")}</option>
            {roomTypes.map((rt) => (
              <option key={rt.id} value={rt.id}>
                {rt.name}
              </option>
            ))}
          </select>
          <button
            onClick={addRoom}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            {t("add")}
          </button>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: 타입체크**

Run: `npx tsc --noEmit`
Expected: 오류 0건 (upsertRoom 시그니처 변경과 호출부 수정이 같은 커밋에 포함).

- [ ] **Step 6: Commit**

```bash
git add messages/ko.json messages/en.json messages/es.json \
  "src/app/[locale]/admin/rooms-actions.ts" \
  src/components/RoomManager.tsx "src/app/[locale]/admin/(protected)/rooms/page.tsx"
git commit -m "feat(admin): 객실 관리에 등급 쿼터 섹션 + 호실 등급·침대 지정

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: `/admin/assignments` 등급별 섹션 그룹

**Files:**
- Modify: `src/app/[locale]/admin/(protected)/assignments/page.tsx`
- Modify: `src/components/AssignmentBoard.tsx`

**Interfaces:**
- Consumes: Task 1 `RoomGrade`, Task 2 `gradeUsage`, Task 4의 i18n 키(`grade.*`, `bed.*`, `gradeUsage`, `gradeUsageUnlimited`, `quotaOver`).
- Produces: `AssignmentBoard` props가 `{ grades: RoomGrade[]; rooms: RoomWithType[]; attendees: AttendeeWithRoom[] }`로 변경.

- [ ] **Step 1: assignments/page.tsx에 room_grades 조회 추가**

```tsx
import type { Room, RoomGrade, RoomType } from "@/lib/types";
// ...
  const [{ data: grades }, { data: rooms }, { data: attendees }] =
    await Promise.all([
      supabase.from("room_grades").select("*").order("sort_order"),
      supabase.from("rooms").select("*, room_types(*)").order("sort_order"),
      supabase
        .from("attendees")
        .select(
          "*, rooms(label, room_types(name, price_per_person)), requested_room_type:room_types!requested_room_type_id(name, price_per_person)",
        )
        .order("is_householder", { ascending: false })
        .order("created_at"),
    ]);
// ...
      <AssignmentBoard
        grades={(grades as RoomGrade[] | null) ?? []}
        rooms={(rooms as (Room & { room_types: RoomType })[] | null) ?? []}
        attendees={withHouseholdRoomType(
          (attendees as AttendeeWithRoom[] | null) ?? [],
        )}
      />
```

- [ ] **Step 2: AssignmentBoard 개편**

`src/components/AssignmentBoard.tsx`를 다음으로 교체 (미배정 섹션·정원 초과 로직은 그대로, 호실 카드만 등급별 섹션으로 그룹):

```tsx
"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { Room, RoomGrade, RoomType } from "@/lib/types";
import type { AttendeeWithRoom } from "@/lib/fees";
import { gradeUsage } from "@/lib/rooms";
import { assignRoom } from "@/app/[locale]/admin/assignment-actions";
import { displayName } from "@/lib/names";

type RoomWithType = Room & { room_types: RoomType };

// 정원 집계: 6세 미만 제외
function counted(list: AttendeeWithRoom[]) {
  return list.filter((a) => !a.is_under_6).length;
}

export function AssignmentBoard({
  grades,
  rooms,
  attendees,
}: {
  grades: RoomGrade[];
  rooms: RoomWithType[];
  attendees: AttendeeWithRoom[];
}) {
  const t = useTranslations("Rooms");
  const router = useRouter();
  const [, start] = useTransition();

  function move(id: string, roomId: string | null) {
    start(async () => {
      await assignRoom(id, roomId);
      router.refresh();
    });
  }

  const usage = gradeUsage(grades, rooms);
  const gradeLabel = (id: string) => {
    const g = grades.find((g) => g.id === id);
    return g ? t(`grade.${g.name}`) : "?";
  };

  const unassigned = attendees.filter((a) => a.room_id == null);
  const roomDropdown = (a: AttendeeWithRoom) => (
    <select
      value={a.room_id ?? ""}
      onChange={(e) => move(a.id, e.target.value || null)}
      className="rounded border border-slate-300 px-1.5 py-0.5 text-xs"
    >
      <option value="">{t("noRoom")}</option>
      {rooms.map((r) => (
        <option key={r.id} value={r.id}>
          {r.label} ({gradeLabel(r.grade_id)}·{r.room_types.name})
        </option>
      ))}
    </select>
  );

  const roomCard = (r: RoomWithType) => {
    const occupants = attendees.filter((a) => a.room_id === r.id);
    const n = counted(occupants);
    const over = n > r.room_types.capacity;
    return (
      <div key={r.id} className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">
            {r.label}{" "}
            <span className="text-xs font-normal text-slate-400">
              {gradeLabel(r.grade_id)}·{t(`bed.${r.bed_type}`)}·
              {r.room_types.name}
            </span>
          </h3>
          <span
            className={
              over
                ? "rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700"
                : "rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
            }
          >
            {t("occupancy", { count: n, capacity: r.room_types.capacity })}
            {over ? ` · ${t("overCapacity")}` : ""}
          </span>
        </div>
        <ul className="space-y-1">
          {occupants.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between text-sm"
            >
              <span>
                {displayName(a)}
                {a.is_under_6 && (
                  <span className="ml-1 text-xs text-amber-600">(6&lt;)</span>
                )}
              </span>
              {roomDropdown(a)}
            </li>
          ))}
          {occupants.length === 0 && (
            <li className="text-xs text-slate-400">{t("empty")}</li>
          )}
        </ul>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* 미배정 */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          {t("unassigned")} ({unassigned.length})
        </h2>
        <ul className="space-y-1">
          {unassigned.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded bg-amber-50 px-3 py-1.5 text-sm ring-1 ring-amber-100"
            >
              <span>
                {displayName(a)}
                {a.is_under_6 && (
                  <span className="ml-1 text-xs text-amber-600">(6&lt;)</span>
                )}
              </span>
              {roomDropdown(a)}
            </li>
          ))}
        </ul>
      </section>

      {/* 등급별 호실 섹션 */}
      {grades.map((g) => {
        const list = rooms.filter((r) => r.grade_id === g.id);
        if (list.length === 0) return null;
        const u = usage.get(g.id);
        return (
          <section key={g.id}>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
              {t(`grade.${g.name}`)}
              {u && (
                <span
                  className={
                    u.over
                      ? "rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700"
                      : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600"
                  }
                >
                  {u.quota == null
                    ? t("gradeUsageUnlimited", { used: u.used })
                    : t("gradeUsage", { used: u.used, quota: u.quota })}
                  {u.over ? ` · ${t("quotaOver")}` : ""}
                </span>
              )}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {list.map(roomCard)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 오류 0건.

- [ ] **Step 4: Commit**

```bash
git add src/components/AssignmentBoard.tsx \
  "src/app/[locale]/admin/(protected)/assignments/page.tsx"
git commit -m "feat(admin): 방배치 보드 등급별 섹션 그룹 + 쿼터 현황 표시

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 전체 검증 (빌드 + 로컬 실동작)

**Files:** 없음 (검증만; 발견된 문제는 수정 후 커밋)

- [ ] **Step 1: 정적 검증**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

Expected: 전부 통과.

- [ ] **Step 2: 로컬 실동작 — 관리자 화면**

`supabase start`(이미 떠 있으면 생략, 0022 적용 확인) → `npm run dev` 후 브라우저에서:

1. `http://localhost:3000/admin/rooms` (Google 로그인 필요 — 로컬 admin 계정): "객실 등급" 섹션에 Premium(무제한)/Luxury(사용 0/10)/Junior Suite(사용 0/2) 표시. Luxury 쿼터를 3으로 저장 → 배지 갱신 확인, 다시 10으로 복원.
2. 호실 추가: 라벨 `T-01`, 등급 Luxury, 침대 더블(침대 2개), 타입 3인실 → Luxury 그룹 아래 `T-01 · 3인실` + 배지 `사용 1 / 10` 확인. 행에서 등급을 Premium으로 인라인 변경 → Premium 그룹으로 이동 확인.
3. `http://localhost:3000/admin/assignments`: Premium 섹션 아래 `T-01 Premium·더블 (침대 2개)·3인실` 카드 + 섹션 헤더 쿼터 배지 확인. 참석자 데이터가 있으면 드롭다운 옵션에 `T-01 (Premium·3인실)` 표기 확인.
4. 테스트 호실 `T-01` 삭제.

- [ ] **Step 3: 로컬 실동작 — 공개 화면 미노출**

1. `http://localhost:3000/register`: 객실 선택이 기존 2/3/4인실 그대로, 등급·침대 어디에도 없음.
2. 시크릿 창(비로그인)에서 REST로 비노출 재확인:

```bash
curl -s "http://127.0.0.1:54321/rest/v1/room_grades?select=*" \
  -H "apikey: $(grep NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY .env.local | cut -d= -f2)"
```

Expected: `[]` (RLS로 anon 접근 차단).

- [ ] **Step 4: 완료 보고**

문제 없으면 사용자에게 결과 요약 보고 (superpowers:verification-before-completion — 실제 출력 확인 후에만 "완료" 선언). 프로덕션 배포(마이그레이션 push + Vercel)는 사용자 확인 후 별도 진행.
