# Phase 2 — 방 배치 + 회비 계산 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 객실 타입·호실을 정의하고 참석자를 호실에 배치하면, 배치로부터 회비를 자동 계산하고, 성도는 본인 가구의 회비·납부만 조회한다.

**Architecture:** Phase 1 위에 `room_types`/`rooms` 테이블과 `attendees.room_id`를 추가. 회비는 저장하지 않고 (방 타입 단가에서) 계산. 납부는 가구주(head) 행의 `paid`를 가구 단위로 재활용. 방 테이블은 RLS로 관리자 전용이고, 성도는 `SECURITY DEFINER` RPC `my_household_fee()`로 금액만 받는다.

**Tech Stack:** Next.js 16 App Router, @supabase/ssr, next-intl v4, Tailwind v4, Postgres(Supabase) — Phase 1과 동일.

## Global Constraints (Phase 1 확립 규약 — 모든 태스크에 적용)

- **검증 도구**: 단위 테스트 러너 없음. 검증은 `npx tsc --noEmit`, `npm run build`, `supabase db reset`, `docker exec -e PGPASSWORD=postgres supabase_db_retreat2026 psql -U postgres -d postgres -c "..."`, dev 서버 + agent-browser/curl 로 한다.
- **Next 16**: 미들웨어는 `src/proxy.ts`. 서버 mutation은 **Server Action**, 인증 라우트만 Route Handler.
- **Supabase**: `@supabase/ssr` 만 사용. 서버 세션 검증은 `getClaims()`. 키는 `NEXT_PUBLIC_SUPABASE_URL`/`_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY`(env).
- **i18n**: ko 기본. DB enum/식별자는 영문 토큰, 화면 라벨은 `messages/{ko,en}.json`. 관리자 입력 데이터(객실 이름 등)는 번역 대상 아님.
- **RLS 자기참조 금지**: attendees 정책 안에서 attendees 직접 서브쿼리 금지(무한재귀). `public.my_attendee_ids()`(SECURITY DEFINER) 사용.
- **관리자 전용 컬럼**은 `guard_privileged_cols` 트리거로 비관리자 UPDATE 시 OLD 값 복원.
- **로컬 DB 컨테이너**: `supabase_db_retreat2026`. 첫 관리자: `joey.kim@bridgerockcap.com`.
- 가격은 USD 정수, attendees.is_under_6=true 는 회비 $0 + 정원 미집계.
- 각 태스크 끝에 커밋. 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

신규:
- `supabase/migrations/0002_rooms.sql` — room_types/rooms/room_id/guard/RLS/RPC
- `src/lib/fees.ts` — 회비 계산 헬퍼 + 타입
- `src/lib/supabase/admin.ts` — (불필요, 기존 server.ts 사용) ❌ 생성 안 함
- `src/app/[locale]/admin/(protected)/rooms/page.tsx` + `src/components/RoomManager.tsx`
- `src/app/[locale]/admin/(protected)/assignments/page.tsx` + `src/components/AssignmentBoard.tsx`
- `src/app/[locale]/admin/rooms-actions.ts`, `src/app/[locale]/admin/assignment-actions.ts`
- `src/components/HouseholdFeeCard.tsx`

수정:
- `src/lib/types.ts` — RoomType, Room, Attendee.room_id
- `src/app/[locale]/admin/(protected)/layout.tsx` — 관리자 서브내비
- `src/app/[locale]/admin/(protected)/page.tsx` + `src/components/AdminAttendeeTable.tsx` — 방 컬럼·회비·가구 납부
- `src/app/[locale]/edit/manage/page.tsx` + `src/components/EditForm.tsx` — 회비 카드
- `messages/ko.json`, `messages/en.json` — Rooms/Fee 네임스페이스

---

## Task 1: DB 마이그레이션 (room_types, rooms, room_id, guard, RLS, RPC)

**Files:**
- Create: `supabase/migrations/0002_rooms.sql`

**Interfaces:**
- Produces: 테이블 `public.room_types(id,name,capacity,price_per_person,sort_order,created_at)`, `public.rooms(id,label,room_type_id,note,sort_order,created_at)`, 컬럼 `public.attendees.room_id uuid`, 함수 `public.my_household_fee() returns table(total int, unassigned_count int, paid boolean)`.

- [ ] **Step 1: 마이그레이션 파일 작성**

Create `supabase/migrations/0002_rooms.sql`:

```sql
-- ============ Phase 2: 객실 + 회비 ============

create table public.room_types (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,                                   -- 예: "4인실"
  capacity         int  not null check (capacity > 0),
  price_per_person int  not null check (price_per_person >= 0),     -- USD 정수
  sort_order       int  not null default 0,
  created_at       timestamptz not null default now()
);

create table public.rooms (
  id           uuid primary key default gen_random_uuid(),
  label        text not null,                                       -- 예: "201호"
  room_type_id uuid not null references public.room_types(id) on delete restrict,
  note         text,
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now()
);

alter table public.attendees
  add column room_id uuid references public.rooms(id) on delete set null;
create index attendees_room_idx on public.attendees(room_id);

-- 관리자 전용 컬럼 보호: room_id 추가
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
  end if;
  return new;
end $$;

-- RLS: 방 테이블 관리자 전용
alter table public.room_types enable row level security;
alter table public.rooms enable row level security;
create policy "room_types_admin" on public.room_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "rooms_admin" on public.rooms
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 성도용: 본인 가구 회비 합계/납부 (방 테이블 비노출, SECURITY DEFINER)
create or replace function public.my_household_fee()
returns table (total int, unassigned_count int, paid boolean)
language sql stable security definer set search_path = public as $$
  with mine as (
    select a.* from public.attendees a
    where a.id in (select public.my_attendee_ids())
       or a.householder_id in (select public.my_attendee_ids())
  )
  select
    coalesce(sum(case when m.is_under_6 then 0
                      when m.room_id is null then 0
                      else rt.price_per_person end), 0)::int as total,
    count(*) filter (where not m.is_under_6 and m.room_id is null)::int as unassigned_count,
    coalesce(bool_or(m.is_householder and m.paid), false) as paid
  from mine m
  left join public.rooms r on m.room_id = r.id
  left join public.room_types rt on r.room_type_id = rt.id;
$$;
grant execute on function public.my_household_fee to authenticated;

-- 시드: 표준 객실 타입 3종
insert into public.room_types (name, capacity, price_per_person, sort_order) values
  ('2인실', 2, 300, 1),
  ('3인실', 3, 250, 2),
  ('4인실', 4, 200, 3);
```

- [ ] **Step 2: 마이그레이션 적용**

Run: `supabase db reset`
Expected: `Applying migration 0001_init.sql...` 와 `Applying migration 0002_rooms.sql...` 둘 다, `Finished` 출력, 에러 없음.

- [ ] **Step 3: 스키마·시드 검증**

Run:
```bash
docker exec -e PGPASSWORD=postgres supabase_db_retreat2026 psql -U postgres -d postgres -c \
"select name,capacity,price_per_person from public.room_types order by sort_order; \
 select column_name from information_schema.columns where table_name='attendees' and column_name='room_id'; \
 select proname from pg_proc where proname='my_household_fee';"
```
Expected: room_types 3행(2인실/300, 3인실/250, 4인실/200), `room_id` 1행, `my_household_fee` 1행.

- [ ] **Step 4: RPC 동작 검증 (데이터 없이 — 0 반환, 에러 없음)**

Run:
```bash
docker exec -i -e PGPASSWORD=postgres supabase_db_retreat2026 psql -U postgres -d postgres <<'SQL'
begin;
set local role authenticated;
set local request.jwt.claims = '{"email":"nobody@example.com","app_metadata":{"app_role":"member"}}';
select * from public.my_household_fee();
rollback;
SQL
```
Expected: 한 행 `total=0, unassigned_count=0, paid=f`, 재귀/권한 에러 없음.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0002_rooms.sql
git commit -m "feat(phase2): room_types/rooms 스키마 + room_id + 회비 RPC + RLS

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 타입 + 회비 계산 헬퍼

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/fees.ts`

**Interfaces:**
- Consumes: `Attendee` (Task 기존), DB 컬럼 (Task 1).
- Produces: 타입 `RoomType`, `Room`, `AttendeeWithRoom`; 함수 `personFee(a: AttendeeWithRoom): number | null`, `groupHouseholds(rows: AttendeeWithRoom[]): Household[]` where `Household = { head: AttendeeWithRoom; members: AttendeeWithRoom[]; total: number; unassignedCount: number }`, `formatUSD(n: number): string`.

- [ ] **Step 1: types.ts 에 RoomType/Room + room_id 추가**

In `src/lib/types.ts`, add the `room_id` field to the `Attendee` interface (after `phone: string | null;`):

```ts
  room_id: string | null; // 배정된 호실 (관리자 전용)
```

And append at end of file:

```ts
export interface RoomType {
  id: string;
  name: string;
  capacity: number;
  price_per_person: number;
  sort_order: number;
  created_at: string;
}

export interface Room {
  id: string;
  label: string;
  room_type_id: string;
  note: string | null;
  sort_order: number;
  created_at: string;
}
```

- [ ] **Step 2: fees.ts 작성**

Create `src/lib/fees.ts`:

```ts
import type { Attendee } from "./types";

// Supabase 중첩 select 결과 형태: attendees + rooms(label, room_types(...))
export type AttendeeWithRoom = Attendee & {
  rooms:
    | {
        label: string;
        room_types: { name: string; price_per_person: number } | null;
      }
    | null;
};

export interface Household {
  head: AttendeeWithRoom;
  members: AttendeeWithRoom[]; // head 제외 가족
  total: number; // 가구 회비 합계(배정분만)
  unassignedCount: number; // 6세 미만 아닌데 미배정인 인원
}

// 사람별 회비: 6세미만=0, 미배정=null, 그 외=방 타입 단가
export function personFee(a: AttendeeWithRoom): number | null {
  if (a.is_under_6) return 0;
  const price = a.rooms?.room_types?.price_per_person;
  return price == null ? null : price;
}

export function formatUSD(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

// 전체 참석자를 가구(head + members)로 묶고 합계 계산
export function groupHouseholds(rows: AttendeeWithRoom[]): Household[] {
  const heads = rows.filter((r) => r.is_householder);
  const byHead = new Map<string, AttendeeWithRoom[]>();
  for (const r of rows) {
    if (r.householder_id) {
      const list = byHead.get(r.householder_id) ?? [];
      list.push(r);
      byHead.set(r.householder_id, list);
    }
  }
  return heads.map((head) => {
    const members = byHead.get(head.id) ?? [];
    const people = [head, ...members];
    const total = people.reduce((sum, p) => sum + (personFee(p) ?? 0), 0);
    const unassignedCount = people.filter(
      (p) => !p.is_under_6 && p.room_id == null,
    ).length;
    return { head, members, total, unassignedCount };
  });
}
```

- [ ] **Step 3: 타입 검증**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/fees.ts
git commit -m "feat(phase2): RoomType/Room 타입 + 회비 계산 헬퍼(fees.ts)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: i18n 메시지 (Rooms / Fee 네임스페이스)

**Files:**
- Modify: `messages/ko.json`, `messages/en.json`

**Interfaces:**
- Produces: 네임스페이스 `Rooms`(roomTypes,rooms,name,capacity,pricePerPerson,label,type,note,add,edit,delete,save,cancel,empty,assignments,unassigned,occupancy,overCapacity,assignTo,title), `Fee`(title,total,paid,unpaid,unassignedNotice,perPerson,exempt,pending). Admin 네임스페이스에 `navAttendees,navRooms,navAssignments` 추가.

- [ ] **Step 1: ko.json 에 Rooms/Fee 추가 + Admin nav 키**

In `messages/ko.json`, add `navAttendees`,`navRooms`,`navAssignments` into the existing `"Admin"` object, and add two new top-level namespaces:

```json
  "Rooms": {
    "title": "객실 관리",
    "roomTypes": "객실 타입",
    "rooms": "호실",
    "name": "이름",
    "capacity": "정원",
    "pricePerPerson": "1인 회비",
    "label": "호실명",
    "type": "타입",
    "note": "비고",
    "add": "추가",
    "edit": "수정",
    "delete": "삭제",
    "save": "저장",
    "cancel": "취소",
    "empty": "아직 없습니다.",
    "assignments": "방 배치",
    "unassigned": "미배정",
    "occupancy": "{count}/{capacity}명",
    "overCapacity": "정원 초과",
    "assignTo": "배정",
    "noRoom": "— 미배정 —"
  },
  "Fee": {
    "title": "회비",
    "total": "가구 회비 합계",
    "paid": "납부 완료",
    "unpaid": "미납",
    "unassignedNotice": "{count}명은 객실 미배정으로 아직 산정되지 않았습니다.",
    "perPerson": "1인",
    "exempt": "면제(6세 미만)",
    "pending": "미산정"
  }
```

In the `"Admin"` object add:
```json
    "navAttendees": "참석자",
    "navRooms": "객실",
    "navAssignments": "방 배치",
```

- [ ] **Step 2: en.json 에 동일 키(영문) 추가**

In `messages/en.json`, add to `"Admin"`:
```json
    "navAttendees": "Attendees",
    "navRooms": "Rooms",
    "navAssignments": "Assignments",
```
And the two namespaces:
```json
  "Rooms": {
    "title": "Room Management",
    "roomTypes": "Room types",
    "rooms": "Rooms",
    "name": "Name",
    "capacity": "Capacity",
    "pricePerPerson": "Fee per person",
    "label": "Room label",
    "type": "Type",
    "note": "Note",
    "add": "Add",
    "edit": "Edit",
    "delete": "Delete",
    "save": "Save",
    "cancel": "Cancel",
    "empty": "None yet.",
    "assignments": "Room assignments",
    "unassigned": "Unassigned",
    "occupancy": "{count}/{capacity}",
    "overCapacity": "Over capacity",
    "assignTo": "Assign",
    "noRoom": "— Unassigned —"
  },
  "Fee": {
    "title": "Fee",
    "total": "Household total",
    "paid": "Paid",
    "unpaid": "Unpaid",
    "unassignedNotice": "{count} not yet calculated (room not assigned).",
    "perPerson": "per person",
    "exempt": "Exempt (under 6)",
    "pending": "Pending"
  }
```

- [ ] **Step 3: JSON 유효성 검증**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/ko.json','utf8'));JSON.parse(require('fs').readFileSync('messages/en.json','utf8'));console.log('JSON ok')"`
Expected: `JSON ok`

- [ ] **Step 4: Commit**

```bash
git add messages/ko.json messages/en.json
git commit -m "feat(phase2): Rooms/Fee i18n 메시지 + 관리자 내비 키

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 객실 관리 (actions + /admin/rooms 페이지 + 관리자 서브내비)

**Files:**
- Create: `src/app/[locale]/admin/rooms-actions.ts`
- Create: `src/components/RoomManager.tsx`
- Create: `src/app/[locale]/admin/(protected)/rooms/page.tsx`
- Modify: `src/app/[locale]/admin/(protected)/layout.tsx`

**Interfaces:**
- Consumes: `RoomType`, `Room` (Task 2), `createClient` from `@/lib/supabase/server`, `useRouter` from `@/i18n/navigation`.
- Produces: server actions `upsertRoomType(input)`, `deleteRoomType(id)`, `upsertRoom(input)`, `deleteRoom(id)` (각각 `Promise<{ok:boolean}>`); component `RoomManager({ roomTypes, rooms })`.

- [ ] **Step 1: rooms-actions.ts 작성**

Create `src/app/[locale]/admin/rooms-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: boolean };

export async function upsertRoomType(input: {
  id?: string;
  name: string;
  capacity: number;
  price_per_person: number;
  sort_order?: number;
}): Promise<Result> {
  const supabase = await createClient();
  const row = {
    name: input.name.trim(),
    capacity: input.capacity,
    price_per_person: input.price_per_person,
    sort_order: input.sort_order ?? 0,
  };
  const { error } = input.id
    ? await supabase.from("room_types").update(row).eq("id", input.id)
    : await supabase.from("room_types").insert(row);
  revalidatePath("/[locale]/admin/rooms", "page");
  return { ok: !error };
}

export async function deleteRoomType(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("room_types").delete().eq("id", id);
  revalidatePath("/[locale]/admin/rooms", "page");
  return { ok: !error };
}

export async function upsertRoom(input: {
  id?: string;
  label: string;
  room_type_id: string;
  note?: string;
  sort_order?: number;
}): Promise<Result> {
  const supabase = await createClient();
  const row = {
    label: input.label.trim(),
    room_type_id: input.room_type_id,
    note: input.note?.trim() || null,
    sort_order: input.sort_order ?? 0,
  };
  const { error } = input.id
    ? await supabase.from("rooms").update(row).eq("id", input.id)
    : await supabase.from("rooms").insert(row);
  revalidatePath("/[locale]/admin/rooms", "page");
  return { ok: !error };
}

export async function deleteRoom(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("rooms").delete().eq("id", id);
  revalidatePath("/[locale]/admin/rooms", "page");
  return { ok: !error };
}
```

- [ ] **Step 2: RoomManager 컴포넌트 작성**

Create `src/components/RoomManager.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { Room, RoomType } from "@/lib/types";
import { formatUSD } from "@/lib/fees";
import {
  upsertRoomType,
  deleteRoomType,
  upsertRoom,
  deleteRoom,
} from "@/app/[locale]/admin/rooms-actions";

const input =
  "rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

export function RoomManager({
  roomTypes,
  rooms,
}: {
  roomTypes: RoomType[];
  rooms: Room[];
}) {
  const t = useTranslations("Rooms");
  const router = useRouter();
  const [, start] = useTransition();

  // 새 객실 타입 입력
  const [tName, setTName] = useState("");
  const [tCap, setTCap] = useState(4);
  const [tPrice, setTPrice] = useState(200);
  // 새 호실 입력
  const [rLabel, setRLabel] = useState("");
  const [rType, setRType] = useState("");

  function refresh() {
    router.refresh();
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
    if (!rLabel.trim() || !rType) return;
    start(async () => {
      await upsertRoom({
        label: rLabel,
        room_type_id: rType,
        sort_order: rooms.length + 1,
      });
      setRLabel("");
      refresh();
    });
  }

  const typeName = (id: string) =>
    roomTypes.find((rt) => rt.id === id)?.name ?? "?";

  return (
    <div className="space-y-10">
      {/* 객실 타입 */}
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

      {/* 호실 */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          {t("rooms")}
        </h2>
        <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
          {rooms.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-500">{t("empty")}</li>
          )}
          {rooms.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <span className="text-slate-800">
                {r.label} · {typeName(r.room_type_id)}
              </span>
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
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input
            className={input}
            placeholder={t("label")}
            value={rLabel}
            onChange={(e) => setRLabel(e.target.value)}
          />
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

- [ ] **Step 3: /admin/rooms 페이지 작성**

Create `src/app/[locale]/admin/(protected)/rooms/page.tsx`:

```tsx
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { RoomManager } from "@/components/RoomManager";
import type { Room, RoomType } from "@/lib/types";

export default async function RoomsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const [{ data: roomTypes }, { data: rooms }] = await Promise.all([
    supabase.from("room_types").select("*").order("sort_order"),
    supabase.from("rooms").select("*").order("sort_order"),
  ]);

  const t = await getTranslations("Rooms");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">{t("title")}</h1>
      <RoomManager
        roomTypes={(roomTypes as RoomType[] | null) ?? []}
        rooms={(rooms as Room[] | null) ?? []}
      />
    </div>
  );
}
```

- [ ] **Step 4: 관리자 서브내비를 protected layout 에 추가**

Modify `src/app/[locale]/admin/(protected)/layout.tsx` — `isAdmin` 확인 후 `return <>{children}</>;` 부분을 아래로 교체 (내비 추가). 파일 상단에 import 추가:

```tsx
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
```

그리고 마지막 `return <>{children}</>;` 를:

```tsx
  const tn = await getTranslations("Admin");
  return (
    <>
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl gap-4 px-4 py-2 text-sm">
          <Link href="/admin" className="text-slate-600 hover:text-slate-900">
            {tn("navAttendees")}
          </Link>
          <Link href="/admin/rooms" className="text-slate-600 hover:text-slate-900">
            {tn("navRooms")}
          </Link>
          <Link
            href="/admin/assignments"
            className="text-slate-600 hover:text-slate-900"
          >
            {tn("navAssignments")}
          </Link>
        </div>
      </nav>
      {children}
    </>
  );
```

(이미 `getTranslations`를 import 중이면 중복 import 하지 말 것.)

- [ ] **Step 5: 빌드 검증**

Run: `npm run build`
Expected: 컴파일 성공, `/[locale]/admin/rooms` 라우트가 빌드 출력에 나타남, 타입 에러 없음.

- [ ] **Step 6: 브라우저 검증 (객실 CRUD)**

Run (dev 서버 실행 중 가정; 관리자 세션은 Mailpit 매직링크로 확보 — Phase 1 검증 절차와 동일):
- `/admin/rooms` 진입 → 시드된 타입 3종(2/3/4인실) 표시 확인
- 호실 추가: label "201호", 타입 "4인실" → 목록에 표시
- DB 확인: `docker exec -e PGPASSWORD=postgres supabase_db_retreat2026 psql -U postgres -d postgres -c "select label,(select name from room_types rt where rt.id=r.room_type_id) from rooms r;"`
Expected: "201호 | 4인실" 행 존재.

- [ ] **Step 7: Commit**

```bash
git add src/app/[locale]/admin/rooms-actions.ts src/components/RoomManager.tsx "src/app/[locale]/admin/(protected)/rooms/page.tsx" "src/app/[locale]/admin/(protected)/layout.tsx"
git commit -m "feat(phase2): 객실 타입/호실 관리 페이지 + 관리자 서브내비

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: 방 배치 보드 (assignment action + /admin/assignments)

**Files:**
- Create: `src/app/[locale]/admin/assignment-actions.ts`
- Create: `src/components/AssignmentBoard.tsx`
- Create: `src/app/[locale]/admin/(protected)/assignments/page.tsx`

**Interfaces:**
- Consumes: `Room`, `RoomType` (Task 2), `AttendeeWithRoom` (Task 2), `createClient`.
- Produces: server action `assignRoom(attendeeId: string, roomId: string | null): Promise<{ok:boolean}>`; component `AssignmentBoard({ rooms, attendees })` where `rooms: (Room & { room_types: RoomType })[]`, `attendees: AttendeeWithRoom[]`.

- [ ] **Step 1: assignment-actions.ts 작성**

Create `src/app/[locale]/admin/assignment-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function assignRoom(
  attendeeId: string,
  roomId: string | null,
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("attendees")
    .update({ room_id: roomId })
    .eq("id", attendeeId);
  revalidatePath("/[locale]/admin/assignments", "page");
  return { ok: !error };
}
```

- [ ] **Step 2: AssignmentBoard 컴포넌트 작성**

Create `src/components/AssignmentBoard.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { Room, RoomType } from "@/lib/types";
import type { AttendeeWithRoom } from "@/lib/fees";
import { assignRoom } from "@/app/[locale]/admin/assignment-actions";

type RoomWithType = Room & { room_types: RoomType };

// 정원 집계: 6세 미만 제외
function counted(list: AttendeeWithRoom[]) {
  return list.filter((a) => !a.is_under_6).length;
}

export function AssignmentBoard({
  rooms,
  attendees,
}: {
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
          {r.label} ({r.room_types.name})
        </option>
      ))}
    </select>
  );

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
                {a.korean_name}
                {a.is_under_6 && (
                  <span className="ml-1 text-xs text-amber-600">(6&lt;)</span>
                )}
              </span>
              {roomDropdown(a)}
            </li>
          ))}
        </ul>
      </section>

      {/* 호실별 카드 = 배치 현황표 */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {rooms.map((r) => {
          const occupants = attendees.filter((a) => a.room_id === r.id);
          const n = counted(occupants);
          const over = n > r.room_types.capacity;
          return (
            <div
              key={r.id}
              className="rounded-xl bg-white p-4 ring-1 ring-slate-200"
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">
                  {r.label}{" "}
                  <span className="text-xs font-normal text-slate-400">
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
                      {a.korean_name}
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
        })}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: /admin/assignments 페이지 작성**

Create `src/app/[locale]/admin/(protected)/assignments/page.tsx`:

```tsx
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AssignmentBoard } from "@/components/AssignmentBoard";
import type { Room, RoomType } from "@/lib/types";
import type { AttendeeWithRoom } from "@/lib/fees";

export default async function AssignmentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const [{ data: rooms }, { data: attendees }] = await Promise.all([
    supabase
      .from("rooms")
      .select("*, room_types(*)")
      .order("sort_order"),
    supabase
      .from("attendees")
      .select("*, rooms(label, room_types(name, price_per_person))")
      .order("is_householder", { ascending: false })
      .order("created_at"),
  ]);

  const t = await getTranslations("Rooms");

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">
        {t("assignments")}
      </h1>
      <AssignmentBoard
        rooms={(rooms as (Room & { room_types: RoomType })[] | null) ?? []}
        attendees={(attendees as AttendeeWithRoom[] | null) ?? []}
      />
    </div>
  );
}
```

- [ ] **Step 4: 빌드 검증**

Run: `npm run build`
Expected: 컴파일 성공, `/[locale]/admin/assignments` 라우트 출력, 타입 에러 없음.

- [ ] **Step 5: 브라우저 검증 (배치 + 정원 경고)**

준비: Phase 1 방식으로 가구 등록 데이터 생성(예: 4인 가구) + Task 4에서 호실 2개(예: 2인실 1개, 4인실 1개) 생성. 관리자 세션으로 `/admin/assignments` 진입.
- 미배정 목록에 참석자들 표시
- 한 참석자를 "201호(4인실)"에 배정 → 호실 카드로 이동, occupancy 증가
- 2인실에 3명(6세 이상) 배정 → **정원 초과 경고 배지** 표시
- 6세 미만 1명 배정 → occupancy 카운트에 **포함되지 않음** 확인
- DB 확인: `psql -c "select korean_name, (select label from rooms where id=room_id) from attendees where room_id is not null;"`

- [ ] **Step 6: Commit**

```bash
git add src/app/[locale]/admin/assignment-actions.ts src/components/AssignmentBoard.tsx "src/app/[locale]/admin/(protected)/assignments/page.tsx"
git commit -m "feat(phase2): 방 배치 보드(호실 배정 + 정원 초과 경고 + 현황표)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: 관리자 참석자 표 — 방 컬럼 + 회비 + 가구 단위 납부

**Files:**
- Modify: `src/components/AdminAttendeeTable.tsx`
- Modify: `src/app/[locale]/admin/(protected)/page.tsx`

**Interfaces:**
- Consumes: `groupHouseholds`, `personFee`, `formatUSD`, `AttendeeWithRoom` (Task 2); `setPaid` (기존 `src/app/[locale]/admin/actions.ts`, 시그니처 `setPaid(id: string, paid: boolean)` 그대로 — head 행 id로 호출).
- Produces: 가구별 그룹 표시 테이블.

- [ ] **Step 1: admin 대시보드 페이지 쿼리에 방·회비 조인 추가**

Modify `src/app/[locale]/admin/(protected)/page.tsx` — 쿼리를 중첩 select로 바꾸고 합계를 회비 기준으로 계산. 파일 전체를 아래로 교체:

```tsx
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AdminAttendeeTable } from "@/components/AdminAttendeeTable";
import { groupHouseholds, type AttendeeWithRoom } from "@/lib/fees";

export default async function AdminDashboardPage({
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            {t("signOut")}
          </button>
        </form>
      </div>
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

- [ ] **Step 2: AdminAttendeeTable 을 가구 그룹 + 방/회비 + 가구 납부로 교체**

Replace `src/components/AdminAttendeeTable.tsx` entirely:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { setPaid } from "@/app/[locale]/admin/actions";
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

- [ ] **Step 3: 빌드 검증**

Run: `npm run build`
Expected: 성공, 타입 에러 없음.

- [ ] **Step 4: 브라우저 검증**

- `/admin` 진입 → 가구별 카드, 각 사람 방·회비 표시(6세미만=면제, 미배정=미산정)
- 가구 합계 금액 정확(배정된 사람 단가 합)
- 가구 납부 토글 → DB의 head 행 paid 갱신, 상단 "납부 가구 수" 갱신
- DB 확인: `psql -c "select korean_name, paid from attendees where is_householder;"`

- [ ] **Step 5: Commit**

```bash
git add src/components/AdminAttendeeTable.tsx "src/app/[locale]/admin/(protected)/page.tsx"
git commit -m "feat(phase2): 관리자 참석자 표 가구 그룹화 + 방/회비 + 가구 단위 납부

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: 성도 회비 카드 (/edit/manage)

**Files:**
- Create: `src/components/HouseholdFeeCard.tsx`
- Modify: `src/app/[locale]/edit/manage/page.tsx`

**Interfaces:**
- Consumes: RPC `my_household_fee()` (Task 1), `createClient` from `@/lib/supabase/server`.
- Produces: server component `HouseholdFeeCard({ total, unassignedCount, paid })`.

- [ ] **Step 1: HouseholdFeeCard 작성**

Create `src/components/HouseholdFeeCard.tsx`:

```tsx
import { useTranslations } from "next-intl";
import { formatUSD } from "@/lib/fees";

export function HouseholdFeeCard({
  total,
  unassignedCount,
  paid,
}: {
  total: number;
  unassignedCount: number;
  paid: boolean;
}) {
  const t = useTranslations("Fee");

  return (
    <div className="mb-8 rounded-xl bg-emerald-50 p-5 ring-1 ring-emerald-200">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-800">{t("title")}</p>
          <p className="mt-1 text-2xl font-bold text-emerald-900">
            {formatUSD(total)}
          </p>
        </div>
        <span
          className={
            paid
              ? "rounded-full bg-emerald-600 px-3 py-1 text-sm font-medium text-white"
              : "rounded-full bg-white px-3 py-1 text-sm font-medium text-emerald-700 ring-1 ring-emerald-300"
          }
        >
          {paid ? t("paid") : t("unpaid")}
        </span>
      </div>
      {unassignedCount > 0 && (
        <p className="mt-2 text-xs text-emerald-700">
          {t("unassignedNotice", { count: unassignedCount })}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: manage 페이지에서 RPC 호출 + 카드 렌더**

Modify `src/app/[locale]/edit/manage/page.tsx` — `attendees` 조회 이후, EditForm 위에 회비 카드를 추가. import 추가:

```tsx
import { HouseholdFeeCard } from "@/components/HouseholdFeeCard";
```

`const { data: attendees } = ...` 다음에 추가:

```tsx
  const { data: fee } = await supabase.rpc("my_household_fee").single();
```

그리고 `<div className="mt-8">` 위(제목 바로 아래)에 카드 삽입:

```tsx
      {fee && (
        <HouseholdFeeCard
          total={fee.total}
          unassignedCount={fee.unassigned_count}
          paid={fee.paid}
        />
      )}
```

(타입: `supabase.rpc("my_household_fee")`는 `{ total:number; unassigned_count:number; paid:boolean }` 단일 행. `.single()` 사용. 만약 타입 경고가 나면 `const fee = (data as { total:number; unassigned_count:number; paid:boolean } | null)` 로 캐스팅.)

- [ ] **Step 3: 빌드 검증**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 4: 검증 — RPC 격리 (SQL)**

Run (Phase 1 데이터 + Task 5에서 배정된 상태 가정):
```bash
docker exec -i -e PGPASSWORD=postgres supabase_db_retreat2026 psql -U postgres -d postgres <<'SQL'
begin;
set local role authenticated;
set local request.jwt.claims = '{"email":"householdB@example.com","app_metadata":{"app_role":"member"}}';
select * from public.my_household_fee();
rollback;
SQL
```
Expected: householdB 가구의 합계만 반환(타가구 금액 미포함), 에러 없음.

- [ ] **Step 5: 브라우저 검증**

`/edit` → householdB 이메일 매직링크(Mailpit) → `/edit/manage` → 상단 **회비 카드**에 가구 합계·납부 여부·미배정 안내 표시.

- [ ] **Step 6: Commit**

```bash
git add src/components/HouseholdFeeCard.tsx "src/app/[locale]/edit/manage/page.tsx"
git commit -m "feat(phase2): 성도 회비 카드(/edit/manage, my_household_fee RPC)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: 통합 스모크 테스트 + Phase 2 마무리

**Files:** (없음 — 검증·문서)

- [ ] **Step 1: 마이그레이션 클린 적용 재확인**

Run: `supabase db reset`
Expected: 0001, 0002 모두 적용, 시드 OK, 에러 없음.

- [ ] **Step 2: 타입·빌드 최종 검증**

Run: `npx tsc --noEmit && npm run build`
Expected: 둘 다 성공, 라우트에 `/admin/rooms`, `/admin/assignments` 포함.

- [ ] **Step 3: agent-browser E2E 스모크**

Phase 1 절차 재사용(가구 등록 → 매직링크). 추가 시나리오:
- 관리자: `/admin/rooms`에서 호실 생성(2인실 1, 4인실 1) → `/admin/assignments`에서 가구원 배정 → 정원 초과 경고 동작 → `/admin`에서 가구 회비 합계·납부 토글
- 성도: householdB 매직링크 → `/edit/manage` 회비 카드 금액이 관리자 배정과 일치
- 격리: 성도가 `room_types`/`rooms` 직접 조회 불가(`curl` REST + publishable key → `[]` 또는 거부), `room_id` 자가수정 불가(트리거)

- [ ] **Step 4: CLAUDE.md / SETUP.md 갱신**

`CLAUDE.md`의 로드맵에서 Phase 2를 완료(✅)로 표시하고, 디렉토리 구조에 `rooms`/`assignments` 페이지, `fees.ts`, `0002_rooms.sql`, `my_household_fee()` 추가. 회비 계산·가구 납부 규칙 1줄 추가.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(phase2): CLAUDE.md 로드맵/구조 갱신 (Phase 2 완료)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push origin main
```

---

## Self-Review (작성자 점검 결과)

**Spec coverage**: room_types/rooms/room_id(Task1) · 회비계산(Task2 fees.ts + Task1 RPC) · RLS·트리거(Task1) · 객실관리 UI(Task4) · 배치보드/현황표/정원경고(Task5) · 관리자 표 방·회비·가구납부(Task6) · 성도 회비카드(Task7) · i18n(Task3). 모든 spec 항목에 대응 태스크 있음.

**Placeholder scan**: TBD/TODO/미정 없음. (작성 중 발견한 잘못된 i18n 키 `Rooms.perPerson` 참조는 인라인 제거함.)

**Type consistency**: `setPaid(id, paid)` 시그니처 유지(head id로 호출) · `AttendeeWithRoom`/`Household`는 Task2에서 정의 후 Task5/6에서 동일 사용 · `my_household_fee()` 반환 `{total, unassigned_count, paid}`가 Task1 정의와 Task7 사용 일치 · `assignRoom(attendeeId, roomId|null)` 일관.
