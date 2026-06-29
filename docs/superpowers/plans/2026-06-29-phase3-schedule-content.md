# Phase 3 — 스케줄 + 콘텐츠 페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 성도가 열람하는 콘텐츠 페이지(소개·강사·Contact = 정적, 스케줄·공지 = DB)와 관리자용 스케줄·공지 관리, 반응형 내비게이션을 추가한다.

**Architecture:** 하이브리드 콘텐츠 모델 — 스케줄·공지는 새 테이블(`schedule_items`, `announcements`)에 저장하고 **공개 읽기 + 관리자 쓰기** RLS를 적용한다. 공개 페이지는 Phase 2와 동일하게 서버 컴포넌트에서 Supabase로 직접 읽는다. 소개·강사·Contact는 정적 i18n 메시지로 렌더한다. 내비게이션은 반응형 헤더 + 모바일 햄버거로 개편한다.

**Tech Stack:** Next.js 16(App Router, Turbopack) · Supabase(@supabase/ssr) · next-intl v4 · Tailwind v4 · TypeScript

## Global Constraints

모든 태스크의 요구사항에 암묵적으로 포함된다:

- **Next.js 16**: 미들웨어는 `src/proxy.ts`(이미 존재). 새 페이지는 `src/app/[locale]/` 하위 → 자동 로케일 라우팅(matcher 변경 불필요).
- **Supabase**: `@supabase/ssr`만 사용. 서버 클라이언트는 `@/lib/supabase/server`의 `createClient()`(async). 세션 검증은 `getClaims()`.
- **next-intl v4**: `ko` 기본, `localePrefix: 'as-needed'`(영어는 `/en/...`). 서버 컴포넌트는 `setRequestLocale(locale)` 호출. `useTranslations`는 컴포넌트 **상단**에서만 호출(콜백 안 금지).
- **Mutation은 Server Action**(`"use server"`). Route Handler는 인증 전용(신규 없음).
- **DB enum/표시 정책**: 스케줄 제목/설명·공지 본문은 **관리자 자유 입력 → 번역 대상 아님**. UI 라벨만 i18n. DB에 표시용 번역 문자열 저장 금지.
- **타임존**: 스케줄 `day`는 `date`, `start_time`은 `time` 타입(wall-clock). 표시 시 `new Date(`${day}T12:00:00`)`(정오 기준)로만 요일 계산해 날짜 경계 흔들림 방지.
- **회비 1인 단가**: 2인실 $300 / 3인실 $250 / 4인실 $200, 6세 미만 면제 (소개 페이지 문구에 사용 — 정확히 일치).
- **Contact 데이터**(정확히 일치): 수련회 장소 = Honor's Haven Retreat & Conference, 1195 Arrowhead Rd, Ellenville, NY 12428 / 교회 본부 = 20 Andrews Road, Hicksville, NY 11801, (516) 822-6464, info@nyevergreen.com.
- **검증 도구**(이 프로젝트엔 단위 테스트 러너 없음): `npx tsc --noEmit`, `npm run lint`, `supabase db reset` + `docker exec ... psql`(RLS), `npm run dev` + 브라우저/agent-browser. 각 태스크의 "테스트"는 이 도구로 수행.
- **로컬 DB 컨테이너**: `supabase_db_retreat2026`. psql: `docker exec -i supabase_db_retreat2026 psql -U postgres -d postgres`.
- **커밋 메시지** 말미: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- 작업 브랜치: `phase3-schedule-content` (이미 생성됨).

---

### Task 1: 마이그레이션 — `schedule_items` / `announcements` + RLS

**Files:**
- Create: `supabase/migrations/0003_content.sql`

**Interfaces:**
- Produces: 테이블 `public.schedule_items(id, day date, start_time time, title text, description text, location text, sort_order int, created_at)`, `public.announcements(id, title text, body text, pinned bool, published bool, published_at timestamptz, created_at, updated_at)`. 공개 읽기 + 관리자 쓰기 RLS. `public.set_updated_at()`(Phase 1)·`public.is_admin()`(Phase 1) 재사용.

- [ ] **Step 1: 마이그레이션 작성**

Create `supabase/migrations/0003_content.sql`:

```sql
-- =====================================================================
-- Phase 3: 스케줄 + 공지 (공개 읽기 / 관리자 쓰기)
-- =====================================================================

-- 스케줄 항목 (관리자 관리, 공개 읽기)
create table public.schedule_items (
  id          uuid primary key default gen_random_uuid(),
  day         date not null,
  start_time  time not null,
  title       text not null,
  description text,
  location    text,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);
create index schedule_items_day_idx on public.schedule_items (day, start_time, sort_order);

-- 공지사항 (관리자 관리, 공개는 published 만)
create table public.announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  pinned       boolean not null default false,
  published    boolean not null default true,
  published_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index announcements_order_idx on public.announcements (pinned desc, published_at desc);
create trigger trg_ann_updated before update on public.announcements
  for each row execute function public.set_updated_at();

-- RLS
alter table public.schedule_items enable row level security;
alter table public.announcements  enable row level security;

-- 스케줄: 누구나 읽기, 관리자만 쓰기
create policy "schedule_public_read" on public.schedule_items
  for select to anon, authenticated using (true);
create policy "schedule_admin_write" on public.schedule_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 공지: 공개는 published=true 만, 관리자는 전부(미게시 포함)
create policy "ann_public_read" on public.announcements
  for select to anon, authenticated using (published);
create policy "ann_admin_all" on public.announcements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
```

- [ ] **Step 2: 마이그레이션 적용 (전체 reset)**

Run: `supabase db reset`
Expected: 모든 마이그레이션(0001·0002·0003)이 오류 없이 적용. 출력 끝에 `Finished supabase db reset` 류 메시지. (room_types 3종 시드, admins 1행 재생성)

- [ ] **Step 3: 스키마 확인**

Run:
```bash
docker exec -i supabase_db_retreat2026 psql -U postgres -d postgres -c "\d+ public.schedule_items" -c "\d+ public.announcements"
```
Expected: 두 테이블이 위 컬럼·타입으로 존재. `announcements`에 `trg_ann_updated` 트리거, 각 테이블에 인덱스 표시.

- [ ] **Step 4: RLS 동작 확인 (공개 읽기 / 게시 필터 / 쓰기 차단)**

Run (트랜잭션 안에서 테스트 후 롤백 → 데이터 미잔존):
```bash
docker exec -i supabase_db_retreat2026 psql -U postgres -d postgres <<'SQL'
begin;
insert into public.announcements(title, body, published) values ('공개글','b',true),('숨김글','b',false);
insert into public.schedule_items(day, start_time, title) values ('2026-09-05','09:00','테스트');
set local role anon;
select '공지(anon):' as label, string_agg(title, ',' order by title) from public.announcements;   -- 공개글만
select '스케줄(anon):' as label, count(*) from public.schedule_items;                               -- 1
savepoint s;
do $$ begin
  insert into public.schedule_items(day, start_time, title) values ('2026-09-06','09:00','x');
  raise exception 'RLS FAIL: anon insert succeeded';
exception when insufficient_privilege then raise notice 'OK: anon insert blocked'; end $$;
rollback to savepoint s;
reset role;
rollback;
SQL
```
Expected:
- `공지(anon): | 공개글` (숨김글 제외)
- `스케줄(anon): | 1`
- `NOTICE: OK: anon insert blocked`
- 트랜잭션 롤백되어 테이블은 비어 있음.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0003_content.sql
git commit -m "$(cat <<'EOF'
feat(phase3): schedule_items/announcements 테이블 + 공개읽기 RLS

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 타입 + 스케줄 헬퍼

**Files:**
- Modify: `src/lib/types.ts` (끝에 추가)
- Create: `src/lib/schedule.ts`

**Interfaces:**
- Consumes: 없음.
- Produces:
  - `interface ScheduleItem { id, day, start_time, title, description, location, sort_order, created_at }` (모두 string except sort_order:number; description/location: `string | null`)
  - `interface Announcement { id, title, body, pinned:boolean, published:boolean, published_at, created_at, updated_at }`
  - `groupByDay(items: ScheduleItem[]): { day: string; items: ScheduleItem[] }[]` — 날짜 오름차순 그룹, 그룹 내 (start_time, sort_order) 오름차순
  - `formatDayLabel(day: string, locale: string): string` — "9월 5일 (토)" / "Sep 5 (Sat)"
  - `formatTime(time: string): string` — "18:00:00" → "18:00"

- [ ] **Step 1: 타입 추가 (`src/lib/types.ts` 끝에 append)**

```ts

export interface ScheduleItem {
  id: string;
  day: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS
  title: string;
  description: string | null;
  location: string | null;
  sort_order: number;
  created_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  published: boolean;
  published_at: string;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: 헬퍼 작성 (`src/lib/schedule.ts`)**

```ts
import type { ScheduleItem } from "./types";

export interface ScheduleDay {
  day: string; // YYYY-MM-DD
  items: ScheduleItem[];
}

// day 별로 그룹: 그룹은 날짜 오름차순, 그룹 내 항목은 (start_time, sort_order) 오름차순
export function groupByDay(items: ScheduleItem[]): ScheduleDay[] {
  const map = new Map<string, ScheduleItem[]>();
  for (const it of items) {
    const arr = map.get(it.day) ?? [];
    arr.push(it);
    map.set(it.day, arr);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, dayItems]) => ({
      day,
      items: [...dayItems].sort(
        (x, y) =>
          x.start_time.localeCompare(y.start_time) || x.sort_order - y.sort_order,
      ),
    }));
}

// "2026-09-05" → 로케일별 날짜+요일. 정오 기준으로 파싱해 타임존 경계 흔들림 방지.
export function formatDayLabel(day: string, locale: string): string {
  const d = new Date(`${day}T12:00:00`);
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(d);
}

// "18:00:00" 또는 "18:00" → "18:00"
export function formatTime(time: string): string {
  return time.slice(0, 5);
}
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 오류 없음(exit 0).

- [ ] **Step 4: 헬퍼 로직 검증 (런타임 확인)**

Run (헬퍼 로직을 순수 JS로 복제해 정렬/그룹 동작만 확인 — TS 임포트 불필요):
```bash
node -e '
const items = [
  {day:"2026-09-06",start_time:"09:00:00",sort_order:0,title:"오전집회"},
  {day:"2026-09-05",start_time:"18:00:00",sort_order:0,title:"저녁식사"},
  {day:"2026-09-05",start_time:"15:00:00",sort_order:0,title:"입실"},
];
const map=new Map();
for(const it of items){const a=map.get(it.day)??[];a.push(it);map.set(it.day,a);}
const groups=[...map.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([day,xs])=>({day,items:xs.sort((x,y)=>x.start_time.localeCompare(y.start_time)||x.sort_order-y.sort_order)}));
console.log(groups.map(g=>g.day+": "+g.items.map(i=>i.title).join(",")).join(" | "));
console.log(new Intl.DateTimeFormat("ko-KR",{month:"long",day:"numeric",weekday:"short"}).format(new Date("2026-09-05T12:00:00")));
'
```
Expected:
```
2026-09-05: 입실,저녁식사 | 2026-09-06: 오전집회
9월 5일 (토)
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/schedule.ts
git commit -m "$(cat <<'EOF'
feat(phase3): ScheduleItem/Announcement 타입 + 날짜 그룹 헬퍼

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: i18n 메시지 — 신규 네임스페이스 + Nav/Admin 키

> 모든 후속 태스크가 이 키들을 사용하므로 먼저 추가한다. `ko.json`과 `en.json`에 **동일한 키 구조**로 넣는다.

**Files:**
- Modify: `messages/ko.json`
- Modify: `messages/en.json`

**Interfaces:**
- Produces: 네임스페이스 `About`, `Schedule`, `Speakers`, `Announcements`, `Contact` + `Nav`에 `about/schedule/speakers/announcements/contact` + `Admin`에 `navSchedule/navAnnouncements`.

- [ ] **Step 1: `messages/ko.json` — `Nav` 객체에 키 추가**

`"admin": "관리자"` 다음에 추가(같은 객체 안):
```json
    "about": "소개",
    "schedule": "일정",
    "speakers": "강사",
    "announcements": "공지",
    "contact": "연락처"
```

- [ ] **Step 2: `messages/ko.json` — `Admin` 객체에 키 추가**

`"navAssignments": "방 배치"` 다음에 추가(같은 객체 안):
```json
    "navSchedule": "일정",
    "navAnnouncements": "공지"
```

- [ ] **Step 3: `messages/ko.json` — 최상위에 신규 네임스페이스 추가**

`"Fee": { ... }` 다음(파일 마지막 `}` 직전)에 추가:
```json
  ,
  "About": {
    "title": "수련회 소개",
    "theme": "복된 만남 / Blessed Encounter",
    "verse": "내가 거기서 이스라엘 자손을 만나리니 내 영광으로 인하여 회막이 거룩하게 될지라",
    "verseRef": "출애굽기 29:43",
    "whenTitle": "일정",
    "when": "2026년 9월 5일(토)부터 7일(월)까지 2박 3일간 진행됩니다.",
    "whereTitle": "장소",
    "where": "Honor's Haven Retreat & Conference (1195 Arrowhead Rd, Ellenville, NY 12428)에서 모입니다.",
    "feeTitle": "회비",
    "fee": "회비는 배정된 객실 인원에 따라 1인 기준으로 책정됩니다.\n• 2인실 $300 / 3인실 $250 / 4인실 $200 (2박 3일 숙박·식사 포함)\n• 6세 미만은 회비가 면제됩니다.\n• 가정당 1부만 제출해 주세요.",
    "expectTitle": "무엇을 기대할 수 있나요",
    "expect": "온 교우가 함께 모여 말씀과 기도, 교제 가운데 주님을 만나는 복된 시간이 준비되어 있습니다."
  },
  "Schedule": {
    "pageTitle": "전체 일정",
    "comingSoon": "일정이 곧 공개됩니다.",
    "manageTitle": "일정 관리",
    "empty": "등록된 일정이 없습니다.",
    "addItem": "일정 추가",
    "editItem": "일정 수정",
    "titleField": "제목",
    "descField": "설명 (선택)",
    "locationField": "장소 (선택)",
    "add": "추가",
    "save": "저장",
    "cancel": "취소",
    "edit": "수정",
    "delete": "삭제"
  },
  "Speakers": {
    "title": "강사 소개",
    "tbaName": "추후 공개",
    "tbaNote": "초청 강사 정보가 확정되는 대로 안내해 드리겠습니다."
  },
  "Announcements": {
    "pageTitle": "공지사항",
    "emptyPublic": "아직 공지사항이 없습니다.",
    "manageTitle": "공지 관리",
    "empty": "작성된 공지가 없습니다.",
    "addItem": "공지 작성",
    "editItem": "공지 수정",
    "titleField": "제목",
    "bodyField": "내용",
    "pinned": "고정",
    "hidden": "숨김",
    "pin": "고정",
    "unpin": "고정 해제",
    "publish": "게시",
    "hide": "숨기기",
    "publishedLabel": "게시",
    "add": "작성",
    "save": "저장",
    "cancel": "취소",
    "edit": "수정",
    "delete": "삭제"
  },
  "Contact": {
    "title": "연락처",
    "venueTitle": "수련회 장소",
    "churchTitle": "교회 본부",
    "phoneLabel": "전화",
    "emailLabel": "이메일",
    "viewMap": "지도 보기"
  }
```

- [ ] **Step 4: `messages/en.json` — 동일 위치에 영문 추가**

`Nav`에:
```json
    "about": "About",
    "schedule": "Schedule",
    "speakers": "Speakers",
    "announcements": "News",
    "contact": "Contact"
```
`Admin`에:
```json
    "navSchedule": "Schedule",
    "navAnnouncements": "Announcements"
```
최상위 신규 네임스페이스:
```json
  ,
  "About": {
    "title": "About the Retreat",
    "theme": "Blessed Encounter",
    "verse": "There I will meet with the Israelites, and the place will be consecrated by my glory.",
    "verseRef": "Exodus 29:43",
    "whenTitle": "When",
    "when": "September 5 (Sat) to 7 (Mon), 2026 — two nights and three days.",
    "whereTitle": "Where",
    "where": "We gather at Honor's Haven Retreat & Conference (1195 Arrowhead Rd, Ellenville, NY 12428).",
    "feeTitle": "Fees",
    "fee": "Fees are per person based on room occupancy.\n• Double $300 / Triple $250 / Quad $200 (2 nights, meals included)\n• Children under 6 are exempt.\n• One submission per household.",
    "expectTitle": "What to Expect",
    "expect": "A blessed time for the whole congregation to gather and meet the Lord through the Word, prayer, and fellowship."
  },
  "Schedule": {
    "pageTitle": "Full Schedule",
    "comingSoon": "The schedule will be announced soon.",
    "manageTitle": "Manage Schedule",
    "empty": "No schedule items yet.",
    "addItem": "Add Item",
    "editItem": "Edit Item",
    "titleField": "Title",
    "descField": "Description (optional)",
    "locationField": "Location (optional)",
    "add": "Add",
    "save": "Save",
    "cancel": "Cancel",
    "edit": "Edit",
    "delete": "Delete"
  },
  "Speakers": {
    "title": "Speakers",
    "tbaName": "To Be Announced",
    "tbaNote": "Speaker information will be shared once confirmed."
  },
  "Announcements": {
    "pageTitle": "Announcements",
    "emptyPublic": "No announcements yet.",
    "manageTitle": "Manage Announcements",
    "empty": "No announcements yet.",
    "addItem": "New Announcement",
    "editItem": "Edit Announcement",
    "titleField": "Title",
    "bodyField": "Body",
    "pinned": "Pinned",
    "hidden": "Hidden",
    "pin": "Pin",
    "unpin": "Unpin",
    "publish": "Publish",
    "hide": "Hide",
    "publishedLabel": "Published",
    "add": "Post",
    "save": "Save",
    "cancel": "Cancel",
    "edit": "Edit",
    "delete": "Delete"
  },
  "Contact": {
    "title": "Contact Us",
    "venueTitle": "Retreat Venue",
    "churchTitle": "Church Office",
    "phoneLabel": "Phone",
    "emailLabel": "Email",
    "viewMap": "View Map"
  }
```

- [ ] **Step 5: JSON 유효성 + 키 동일성 확인**

Run:
```bash
node -e '
const ko=require("./messages/ko.json"), en=require("./messages/en.json");
const keys=o=>Object.entries(o).flatMap(([k,v])=>typeof v==="object"&&v?Object.keys(v).map(x=>k+"."+x):[k]);
const a=new Set(keys(ko)), b=new Set(keys(en));
const onlyKo=[...a].filter(x=>!b.has(x)), onlyEn=[...b].filter(x=>!a.has(x));
if(onlyKo.length||onlyEn.length){console.error("MISMATCH",{onlyKo,onlyEn});process.exit(1);}
console.log("OK: ko/en keys match,",a.size,"keys");
'
```
Expected: `OK: ko/en keys match, <N> keys` (불일치 시 어떤 키가 빠졌는지 출력하고 실패).

- [ ] **Step 6: Commit**

```bash
git add messages/ko.json messages/en.json
git commit -m "$(cat <<'EOF'
feat(phase3): i18n 메시지(About/Schedule/Speakers/Announcements/Contact + Nav/Admin)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 관리자 스케줄 관리 (`/admin/schedule`)

**Files:**
- Create: `src/app/[locale]/admin/schedule-actions.ts`
- Create: `src/app/[locale]/admin/(protected)/schedule/page.tsx`
- Create: `src/components/ScheduleManager.tsx`
- Modify: `src/app/[locale]/admin/(protected)/layout.tsx` (서브내비에 링크 추가)

**Interfaces:**
- Consumes: `ScheduleItem`(Task 2), `groupByDay`/`formatDayLabel`/`formatTime`(Task 2), `Schedule`/`Admin` 메시지(Task 3).
- Produces: 서버 액션 `upsertScheduleItem(input)`, `deleteScheduleItem(id)` (둘 다 `Promise<{ ok: boolean }>`).

- [ ] **Step 1: 서버 액션 작성 (`src/app/[locale]/admin/schedule-actions.ts`)**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: boolean };

export async function upsertScheduleItem(input: {
  id?: string;
  day: string;
  start_time: string;
  title: string;
  description?: string | null;
  location?: string | null;
  sort_order?: number;
}): Promise<Result> {
  const supabase = await createClient();
  const row = {
    day: input.day,
    start_time: input.start_time,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    location: input.location?.trim() || null,
    sort_order: input.sort_order ?? 0,
  };
  const { error } = input.id
    ? await supabase.from("schedule_items").update(row).eq("id", input.id)
    : await supabase.from("schedule_items").insert(row);
  revalidatePath("/[locale]/admin/schedule", "page");
  revalidatePath("/[locale]/schedule", "page");
  return { ok: !error };
}

export async function deleteScheduleItem(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("schedule_items").delete().eq("id", id);
  revalidatePath("/[locale]/admin/schedule", "page");
  revalidatePath("/[locale]/schedule", "page");
  return { ok: !error };
}
```

- [ ] **Step 2: 관리자 페이지 작성 (`src/app/[locale]/admin/(protected)/schedule/page.tsx`)**

```tsx
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ScheduleManager } from "@/components/ScheduleManager";
import type { ScheduleItem } from "@/lib/types";

export default async function AdminSchedulePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data } = await supabase
    .from("schedule_items")
    .select("*")
    .order("day")
    .order("start_time")
    .order("sort_order");

  const t = await getTranslations("Schedule");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">{t("manageTitle")}</h1>
      <ScheduleManager items={(data as ScheduleItem[] | null) ?? []} />
    </div>
  );
}
```

- [ ] **Step 3: ScheduleManager 컴포넌트 (`src/components/ScheduleManager.tsx`)**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { ScheduleItem } from "@/lib/types";
import { groupByDay, formatDayLabel, formatTime } from "@/lib/schedule";
import {
  upsertScheduleItem,
  deleteScheduleItem,
} from "@/app/[locale]/admin/schedule-actions";

const input =
  "rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

// 수련회 3일 (고정)
const RETREAT_DAYS = ["2026-09-05", "2026-09-06", "2026-09-07"];

export function ScheduleManager({ items }: { items: ScheduleItem[] }) {
  const t = useTranslations("Schedule");
  const locale = useLocale();
  const router = useRouter();
  const [, start] = useTransition();

  const [editId, setEditId] = useState<string | null>(null);
  const [day, setDay] = useState(RETREAT_DAYS[0]);
  const [time, setTime] = useState("09:00");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [loc, setLoc] = useState("");

  function reset() {
    setEditId(null);
    setDay(RETREAT_DAYS[0]);
    setTime("09:00");
    setTitle("");
    setDesc("");
    setLoc("");
  }

  function submit() {
    if (!title.trim()) return;
    start(async () => {
      await upsertScheduleItem({
        id: editId ?? undefined,
        day,
        start_time: time,
        title,
        description: desc,
        location: loc,
      });
      reset();
      router.refresh();
    });
  }

  function editItem(it: ScheduleItem) {
    setEditId(it.id);
    setDay(it.day);
    setTime(formatTime(it.start_time));
    setTitle(it.title);
    setDesc(it.description ?? "");
    setLoc(it.location ?? "");
  }

  const groups = groupByDay(items);

  return (
    <div className="space-y-8">
      {groups.length === 0 && (
        <p className="text-sm text-slate-500">{t("empty")}</p>
      )}
      {groups.map((g) => (
        <section key={g.day}>
          <h2 className="mb-2 text-lg font-semibold text-slate-900">
            {formatDayLabel(g.day, locale)}
          </h2>
          <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
            {g.items.map((it) => (
              <li
                key={it.id}
                className="flex items-start justify-between gap-3 px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium text-slate-800">
                    {formatTime(it.start_time)} · {it.title}
                  </span>
                  {it.location && (
                    <span className="text-slate-400"> @{it.location}</span>
                  )}
                  {it.description && (
                    <p className="text-slate-500">{it.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => editItem(it)}
                    className="text-emerald-700 hover:text-emerald-800"
                  >
                    {t("edit")}
                  </button>
                  <button
                    onClick={() =>
                      start(async () => {
                        await deleteScheduleItem(it.id);
                        router.refresh();
                      })
                    }
                    className="text-rose-600 hover:text-rose-700"
                  >
                    {t("delete")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="rounded-lg p-4 ring-1 ring-slate-200">
        <h2 className="mb-3 text-base font-semibold text-slate-900">
          {editId ? t("editItem") : t("addItem")}
        </h2>
        <div className="flex flex-wrap items-end gap-2">
          <select
            className={input}
            value={day}
            onChange={(e) => setDay(e.target.value)}
          >
            {RETREAT_DAYS.map((d) => (
              <option key={d} value={d}>
                {formatDayLabel(d, locale)}
              </option>
            ))}
          </select>
          <input
            className={`${input} w-24`}
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
          <input
            className={input}
            placeholder={t("titleField")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className={input}
            placeholder={t("locationField")}
            value={loc}
            onChange={(e) => setLoc(e.target.value)}
          />
          <input
            className={`${input} flex-1`}
            placeholder={t("descField")}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          <button
            onClick={submit}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            {editId ? t("save") : t("add")}
          </button>
          {editId && (
            <button
              onClick={reset}
              className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700"
            >
              {t("cancel")}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: 서브내비 링크 추가 (`.../（protected)/layout.tsx`)**

`navAssignments` Link 블록 다음에 추가:
```tsx
          <Link
            href="/admin/schedule"
            className="text-slate-600 hover:text-slate-900"
          >
            {tn("navSchedule")}
          </Link>
          <Link
            href="/admin/announcements"
            className="text-slate-600 hover:text-slate-900"
          >
            {tn("navAnnouncements")}
          </Link>
```
(announcements 링크는 Task 5에서 페이지가 생기지만, 내비는 함께 추가해도 무방 — 두 링크를 같이 넣는다.)

- [ ] **Step 5: 타입체크 + 린트**

Run: `npx tsc --noEmit && npm run lint`
Expected: 오류 없음.

- [ ] **Step 6: 기능 확인 (브라우저)**

`npm run dev`가 실행 중이라고 가정. 관리자 세션으로 `http://localhost:3000/admin/schedule` 접속:
- 폼에서 날짜(9/5)·시간(18:00)·제목("저녁식사")·장소("식당") 입력 → 추가 → 목록에 날짜 그룹으로 표시.
- 항목 "수정" → 폼에 값 로드 → 제목 변경 → 저장 → 반영.
- "삭제" → 목록에서 제거.
(관리자 로그인: `/edit`에서 `logosguru@gmail.com` 매직링크 → Mailpit http://127.0.0.1:54324 → 링크 클릭)

- [ ] **Step 7: Commit**

```bash
git add src/app/\[locale\]/admin/schedule-actions.ts "src/app/[locale]/admin/(protected)/schedule/page.tsx" src/components/ScheduleManager.tsx "src/app/[locale]/admin/(protected)/layout.tsx"
git commit -m "$(cat <<'EOF'
feat(phase3): 관리자 일정 관리(/admin/schedule) + 서브내비

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 관리자 공지 관리 (`/admin/announcements`)

**Files:**
- Create: `src/app/[locale]/admin/announcement-actions.ts`
- Create: `src/app/[locale]/admin/(protected)/announcements/page.tsx`
- Create: `src/components/AnnouncementManager.tsx`

**Interfaces:**
- Consumes: `Announcement`(Task 2), `Announcements` 메시지(Task 3). 서브내비 링크는 Task 4에서 이미 추가됨.
- Produces: 서버 액션 `upsertAnnouncement(input)`, `deleteAnnouncement(id)`, `toggleAnnouncementFlag(id, field, value)` (모두 `Promise<{ ok: boolean }>`). `field`는 `"pinned" | "published"`.

- [ ] **Step 1: 서버 액션 (`src/app/[locale]/admin/announcement-actions.ts`)**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: boolean };

export async function upsertAnnouncement(input: {
  id?: string;
  title: string;
  body: string;
  pinned?: boolean;
  published?: boolean;
}): Promise<Result> {
  const supabase = await createClient();
  const row = {
    title: input.title.trim(),
    body: input.body.trim(),
    pinned: input.pinned ?? false,
    published: input.published ?? true,
  };
  const { error } = input.id
    ? await supabase.from("announcements").update(row).eq("id", input.id)
    : await supabase.from("announcements").insert(row);
  revalidatePath("/[locale]/admin/announcements", "page");
  revalidatePath("/[locale]/announcements", "page");
  return { ok: !error };
}

export async function deleteAnnouncement(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("announcements").delete().eq("id", id);
  revalidatePath("/[locale]/admin/announcements", "page");
  revalidatePath("/[locale]/announcements", "page");
  return { ok: !error };
}

export async function toggleAnnouncementFlag(
  id: string,
  field: "pinned" | "published",
  value: boolean,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("announcements")
    .update({ [field]: value })
    .eq("id", id);
  revalidatePath("/[locale]/admin/announcements", "page");
  revalidatePath("/[locale]/announcements", "page");
  return { ok: !error };
}
```

- [ ] **Step 2: 관리자 페이지 (`src/app/[locale]/admin/(protected)/announcements/page.tsx`)**

```tsx
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AnnouncementManager } from "@/components/AnnouncementManager";
import type { Announcement } from "@/lib/types";

export default async function AdminAnnouncementsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data } = await supabase
    .from("announcements")
    .select("*")
    .order("pinned", { ascending: false })
    .order("published_at", { ascending: false });

  const t = await getTranslations("Announcements");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">{t("manageTitle")}</h1>
      <AnnouncementManager items={(data as Announcement[] | null) ?? []} />
    </div>
  );
}
```

- [ ] **Step 3: AnnouncementManager (`src/components/AnnouncementManager.tsx`)**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { Announcement } from "@/lib/types";
import {
  upsertAnnouncement,
  deleteAnnouncement,
  toggleAnnouncementFlag,
} from "@/app/[locale]/admin/announcement-actions";

const input =
  "rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

export function AnnouncementManager({ items }: { items: Announcement[] }) {
  const t = useTranslations("Announcements");
  const router = useRouter();
  const [, start] = useTransition();

  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [published, setPublished] = useState(true);

  function reset() {
    setEditId(null);
    setTitle("");
    setBody("");
    setPinned(false);
    setPublished(true);
  }

  function submit() {
    if (!title.trim() || !body.trim()) return;
    start(async () => {
      await upsertAnnouncement({
        id: editId ?? undefined,
        title,
        body,
        pinned,
        published,
      });
      reset();
      router.refresh();
    });
  }

  function editItem(a: Announcement) {
    setEditId(a.id);
    setTitle(a.title);
    setBody(a.body);
    setPinned(a.pinned);
    setPublished(a.published);
  }

  return (
    <div className="space-y-8">
      <ul className="space-y-3">
        {items.length === 0 && (
          <li className="text-sm text-slate-500">{t("empty")}</li>
        )}
        {items.map((a) => (
          <li key={a.id} className="rounded-lg p-3 text-sm ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="font-semibold text-slate-900">{a.title}</span>
                {a.pinned && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                    {t("pinned")}
                  </span>
                )}
                {!a.published && (
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                    {t("hidden")}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() =>
                    start(async () => {
                      await toggleAnnouncementFlag(a.id, "pinned", !a.pinned);
                      router.refresh();
                    })
                  }
                  className="text-slate-600 hover:text-slate-900"
                >
                  {a.pinned ? t("unpin") : t("pin")}
                </button>
                <button
                  onClick={() =>
                    start(async () => {
                      await toggleAnnouncementFlag(
                        a.id,
                        "published",
                        !a.published,
                      );
                      router.refresh();
                    })
                  }
                  className="text-slate-600 hover:text-slate-900"
                >
                  {a.published ? t("hide") : t("publish")}
                </button>
                <button
                  onClick={() => editItem(a)}
                  className="text-emerald-700 hover:text-emerald-800"
                >
                  {t("edit")}
                </button>
                <button
                  onClick={() =>
                    start(async () => {
                      await deleteAnnouncement(a.id);
                      router.refresh();
                    })
                  }
                  className="text-rose-600 hover:text-rose-700"
                >
                  {t("delete")}
                </button>
              </div>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-slate-600">{a.body}</p>
          </li>
        ))}
      </ul>

      <section className="rounded-lg p-4 ring-1 ring-slate-200">
        <h2 className="mb-3 text-base font-semibold text-slate-900">
          {editId ? t("editItem") : t("addItem")}
        </h2>
        <div className="space-y-2">
          <input
            className={`${input} w-full`}
            placeholder={t("titleField")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className={`${input} w-full`}
            rows={4}
            placeholder={t("bodyField")}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
              />{" "}
              {t("pinned")}
            </label>
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={published}
                onChange={(e) => setPublished(e.target.checked)}
              />{" "}
              {t("publishedLabel")}
            </label>
            <button
              onClick={submit}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              {editId ? t("save") : t("add")}
            </button>
            {editId && (
              <button
                onClick={reset}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                {t("cancel")}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: 타입체크 + 린트**

Run: `npx tsc --noEmit && npm run lint`
Expected: 오류 없음.

- [ ] **Step 5: 기능 확인 (브라우저)**

관리자 세션으로 `http://localhost:3000/admin/announcements`:
- 제목·내용 입력 → 작성 → 목록에 표시.
- "고정" 토글 → 고정 배지, 목록 상단 정렬. "숨기기" → "숨김" 배지.
- "수정" → 폼 로드 → 저장. "삭제" → 제거.

- [ ] **Step 6: Commit**

```bash
git add src/app/\[locale\]/admin/announcement-actions.ts "src/app/[locale]/admin/(protected)/announcements/page.tsx" src/components/AnnouncementManager.tsx
git commit -m "$(cat <<'EOF'
feat(phase3): 관리자 공지 관리(/admin/announcements) + 고정/게시 토글

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 공개 스케줄 페이지 (`/schedule`)

**Files:**
- Create: `src/app/[locale]/schedule/page.tsx`
- Create: `src/components/ScheduleView.tsx`

**Interfaces:**
- Consumes: `ScheduleItem`(Task 2), `groupByDay`/`formatDayLabel`/`formatTime`(Task 2), `Schedule` 메시지(Task 3).
- Produces: 없음(말단 페이지).

- [ ] **Step 1: 페이지 (`src/app/[locale]/schedule/page.tsx`)**

```tsx
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ScheduleView } from "@/components/ScheduleView";
import type { ScheduleItem } from "@/lib/types";

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data } = await supabase
    .from("schedule_items")
    .select("*")
    .order("day")
    .order("start_time")
    .order("sort_order");

  const t = await getTranslations("Schedule");
  const items = (data as ScheduleItem[] | null) ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-bold text-slate-900">{t("pageTitle")}</h1>
      {items.length === 0 ? (
        <p className="mt-6 text-slate-500">{t("comingSoon")}</p>
      ) : (
        <ScheduleView items={items} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: ScheduleView (`src/components/ScheduleView.tsx`)**

```tsx
"use client";

import { useLocale } from "next-intl";
import type { ScheduleItem } from "@/lib/types";
import { groupByDay, formatDayLabel, formatTime } from "@/lib/schedule";

export function ScheduleView({ items }: { items: ScheduleItem[] }) {
  const locale = useLocale();
  const groups = groupByDay(items);

  return (
    <div className="mt-8 space-y-10">
      {groups.map((g) => (
        <section key={g.day}>
          <h2 className="mb-3 border-b border-emerald-100 pb-1 text-xl font-semibold text-emerald-800">
            {formatDayLabel(g.day, locale)}
          </h2>
          <ul className="space-y-3">
            {g.items.map((it) => (
              <li key={it.id} className="flex gap-4">
                <span className="w-14 shrink-0 font-mono text-sm text-emerald-700">
                  {formatTime(it.start_time)}
                </span>
                <div>
                  <p className="font-medium text-slate-800">
                    {it.title}
                    {it.location && (
                      <span className="ml-2 text-sm font-normal text-slate-400">
                        @{it.location}
                      </span>
                    )}
                  </p>
                  {it.description && (
                    <p className="text-sm text-slate-500">{it.description}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: 타입체크 + 린트**

Run: `npx tsc --noEmit && npm run lint`
Expected: 오류 없음.

- [ ] **Step 4: 기능 확인 (로그인 없이)**

브라우저 시크릿 창(비로그인)으로 `http://localhost:3000/schedule`:
- Task 4에서 입력한 일정이 날짜별 그룹·시간순으로 보임.
- 일정이 없으면 "일정이 곧 공개됩니다." 표시.
- `/en/schedule`에서 날짜 라벨이 영어(예: "September 5 (Sat)").

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/schedule/page.tsx" src/components/ScheduleView.tsx
git commit -m "$(cat <<'EOF'
feat(phase3): 공개 일정 페이지(/schedule)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 공개 공지 페이지 (`/announcements`)

**Files:**
- Create: `src/app/[locale]/announcements/page.tsx`

**Interfaces:**
- Consumes: `Announcement`(Task 2), `Announcements` 메시지(Task 3). 공개 가시성은 RLS(`ann_public_read`)가 처리(published만) → 쿼리에 별도 필터 불필요.
- Produces: 없음.

- [ ] **Step 1: 페이지 (`src/app/[locale]/announcements/page.tsx`)**

```tsx
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import type { Announcement } from "@/lib/types";

export default async function AnnouncementsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data } = await supabase
    .from("announcements")
    .select("*")
    .order("pinned", { ascending: false })
    .order("published_at", { ascending: false });

  const t = await getTranslations("Announcements");
  const items = (data as Announcement[] | null) ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-bold text-slate-900">{t("pageTitle")}</h1>
      {items.length === 0 ? (
        <p className="mt-6 text-slate-500">{t("emptyPublic")}</p>
      ) : (
        <ul className="mt-8 space-y-6">
          {items.map((a) => (
            <li
              key={a.id}
              className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
            >
              <div className="flex items-center gap-2">
                {a.pinned && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                    {t("pinned")}
                  </span>
                )}
                <h2 className="text-lg font-semibold text-slate-900">{a.title}</h2>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-slate-600">{a.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 타입체크 + 린트**

Run: `npx tsc --noEmit && npm run lint`
Expected: 오류 없음.

- [ ] **Step 3: 기능 확인 (비로그인 — published 필터 핵심)**

브라우저 시크릿 창(비로그인)으로 `http://localhost:3000/announcements`:
- Task 5에서 **게시(published)** 한 공지만 보임. **숨김(published=false)** 공지는 안 보임.
- 고정 공지가 상단, 나머지 최신순.
- 본문 줄바꿈 보존(whitespace-pre-wrap).

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/announcements/page.tsx"
git commit -m "$(cat <<'EOF'
feat(phase3): 공개 공지 페이지(/announcements, 고정-먼저·게시분만)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 정적 페이지 — 소개 / 강사 / Contact

**Files:**
- Create: `src/app/[locale]/about/page.tsx`
- Create: `src/app/[locale]/speakers/page.tsx`
- Create: `src/app/[locale]/contact/page.tsx`

**Interfaces:**
- Consumes: `About`/`Speakers`/`Contact` 메시지(Task 3).
- Produces: 없음.

- [ ] **Step 1: 소개 (`src/app/[locale]/about/page.tsx`)**

```tsx
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";

export default function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = use(params);
  setRequestLocale(locale);

  const t = useTranslations("About");

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-bold text-slate-900">{t("title")}</h1>
      <p className="mt-2 text-emerald-700">{t("theme")}</p>
      <blockquote className="mt-4 border-l-4 border-emerald-200 pl-4 italic text-slate-600">
        “{t("verse")}”
        <footer className="mt-1 text-sm not-italic text-slate-400">
          — {t("verseRef")}
        </footer>
      </blockquote>
      <div className="mt-8 space-y-6 leading-relaxed text-slate-700">
        <section>
          <h2 className="text-lg font-semibold text-slate-900">{t("whenTitle")}</h2>
          <p>{t("when")}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-slate-900">{t("whereTitle")}</h2>
          <p>{t("where")}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-slate-900">{t("feeTitle")}</h2>
          <p className="whitespace-pre-line">{t("fee")}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-slate-900">
            {t("expectTitle")}
          </h2>
          <p>{t("expect")}</p>
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 강사 (`src/app/[locale]/speakers/page.tsx`)**

```tsx
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";

export default function SpeakersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = use(params);
  setRequestLocale(locale);

  const t = useTranslations("Speakers");

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-bold text-slate-900">{t("title")}</h1>
      <div className="mt-8 rounded-xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
        <div className="mx-auto h-24 w-24 rounded-full bg-slate-100" aria-hidden />
        <p className="mt-4 font-semibold text-slate-800">{t("tbaName")}</p>
        <p className="text-sm text-slate-500">{t("tbaNote")}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Contact (`src/app/[locale]/contact/page.tsx`)**

```tsx
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";

const VENUE_ADDRESS =
  "Honor's Haven Retreat & Conference, 1195 Arrowhead Rd, Ellenville, NY 12428";
const CHURCH_ADDRESS = "20 Andrews Road, Hicksville, NY 11801";

function mapUrl(q: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export default function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = use(params);
  setRequestLocale(locale);

  const t = useTranslations("Contact");

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-12">
      <h1 className="text-3xl font-bold text-slate-900">{t("title")}</h1>

      <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">{t("venueTitle")}</h2>
        <p className="mt-2 text-slate-700">Honor&apos;s Haven Retreat &amp; Conference</p>
        <p className="text-slate-600">1195 Arrowhead Rd, Ellenville, NY 12428</p>
        <a
          href={mapUrl(VENUE_ADDRESS)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-sm font-medium text-emerald-700 hover:text-emerald-800"
        >
          {t("viewMap")} →
        </a>
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">{t("churchTitle")}</h2>
        <p className="mt-2 text-slate-700">20 Andrews Road, Hicksville, NY 11801</p>
        <p className="text-slate-600">
          {t("phoneLabel")}:{" "}
          <a
            href="tel:+15168226464"
            className="text-emerald-700 hover:text-emerald-800"
          >
            (516) 822-6464
          </a>
        </p>
        <p className="text-slate-600">
          {t("emailLabel")}:{" "}
          <a
            href="mailto:info@nyevergreen.com"
            className="text-emerald-700 hover:text-emerald-800"
          >
            info@nyevergreen.com
          </a>
        </p>
        <a
          href={mapUrl(CHURCH_ADDRESS)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-sm font-medium text-emerald-700 hover:text-emerald-800"
        >
          {t("viewMap")} →
        </a>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: 타입체크 + 린트**

Run: `npx tsc --noEmit && npm run lint`
Expected: 오류 없음.

- [ ] **Step 5: 기능 확인**

- `http://localhost:3000/about` — 소개·말씀·일정·장소·회비(2인실 $300 등)·기대 섹션. `/en/about` 영어.
- `http://localhost:3000/speakers` — "추후 공개" 플레이스홀더 카드.
- `http://localhost:3000/contact` — 수련회 장소·교회 본부 카드, 전화/이메일 링크, "지도 보기" 클릭 시 새 탭으로 Google Maps 열림.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/about/page.tsx" "src/app/[locale]/speakers/page.tsx" "src/app/[locale]/contact/page.tsx"
git commit -m "$(cat <<'EOF'
feat(phase3): 정적 콘텐츠 페이지(소개/강사/Contact + 지도 링크)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 반응형 내비게이션 (헤더 + 모바일 햄버거)

**Files:**
- Modify: `src/components/SiteHeader.tsx`
- Create: `src/components/MobileNav.tsx`

**Interfaces:**
- Consumes: `Nav` 메시지(Task 3 — about/schedule/speakers/announcements/contact/register/edit), `@/i18n/navigation`의 `Link`/`usePathname`, `LocaleSwitcher`.
- Produces: 없음.
- 주의: `LocaleSwitcher`는 어두운 헤더용 스타일이므로 **데스크톱·모바일 모두 헤더 바에 그대로 노출**하고, 햄버거 패널 안에는 넣지 않는다.

- [ ] **Step 1: MobileNav (`src/components/MobileNav.tsx`)**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";

export function MobileNav({
  links,
  registerLabel,
  editLabel,
}: {
  links: readonly { href: string; label: string }[];
  registerLabel: string;
  editLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // 라우트 변경 시 패널 닫기
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-md text-emerald-50 hover:bg-white/10"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-52 rounded-lg bg-white py-2 shadow-lg ring-1 ring-slate-200">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/register"
            className="block px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-slate-50"
          >
            {registerLabel}
          </Link>
          <Link
            href="/edit"
            className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            {editLabel}
          </Link>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: SiteHeader 개편 (`src/components/SiteHeader.tsx` 전체 교체)**

```tsx
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { MobileNav } from "./MobileNav";
import logo from "../../public/evergreen-logo.webp";

export function SiteHeader() {
  const t = useTranslations("Nav");

  const links = [
    { href: "/about", label: t("about") },
    { href: "/schedule", label: t("schedule") },
    { href: "/speakers", label: t("speakers") },
    { href: "/announcements", label: t("announcements") },
    { href: "/contact", label: t("contact") },
  ] as const;

  return (
    <header className="bg-emerald-800">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center" aria-label="Evergreen Church">
          <Image src={logo} alt="Evergreen Church" priority className="h-8 w-auto" />
        </Link>

        {/* 데스크톱 내비 */}
        <nav className="hidden items-center gap-4 text-sm sm:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-emerald-50/90 hover:text-white"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/register"
            className="rounded-md bg-white/15 px-3 py-1.5 font-medium text-white hover:bg-white/25"
          >
            {t("register")}
          </Link>
          <Link href="/edit" className="text-emerald-50/90 hover:text-white">
            {t("edit")}
          </Link>
          <LocaleSwitcher />
        </nav>

        {/* 모바일 내비 (LocaleSwitcher는 바에 유지, 링크는 햄버거 패널) */}
        <div className="flex items-center gap-2 sm:hidden">
          <LocaleSwitcher />
          <MobileNav
            links={links}
            registerLabel={t("register")}
            editLabel={t("edit")}
          />
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: 타입체크 + 린트**

Run: `npx tsc --noEmit && npm run lint`
Expected: 오류 없음.

- [ ] **Step 4: 기능 확인 (반응형)**

- 데스크톱 폭: 헤더에 소개·일정·강사·공지·연락처 링크 + "등록" 버튼 + "내 등록 수정" + 언어 토글. 각 링크 클릭 시 해당 페이지 이동.
- 모바일 폭(개발자도구 < 640px): 링크가 사라지고 햄버거 + 언어 토글만. 햄버거 클릭 → 패널 열림(링크 + 등록 + 수정). 링크 클릭하면 이동 후 패널 닫힘.
- `/en` 에서 영어 라벨(About/Schedule/...).

- [ ] **Step 5: Commit**

```bash
git add src/components/SiteHeader.tsx src/components/MobileNav.tsx
git commit -m "$(cat <<'EOF'
feat(phase3): 반응형 헤더 + 모바일 햄버거 내비

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: 통합 검증 + 로컬 샘플 시드 + 문서/로드맵 갱신

**Files:**
- Create: `scratchpad/phase3-seed.sql` (로컬 둘러보기용 — 커밋 안 함)
- Modify: `CLAUDE.md` (로드맵·구조·현재상태)
- Modify: `MEMORY.md`(메모리 인덱스) + `memory/next-session.md`

**Interfaces:**
- Consumes: Task 1~9 전부.

- [ ] **Step 1: 전체 빌드 검증**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 셋 다 오류 없이 성공(`npm run build`는 모든 라우트가 컴파일됨 — `/[locale]/about`, `/schedule`, `/speakers`, `/announcements`, `/contact`, `/admin/schedule`, `/admin/announcements` 포함).

- [ ] **Step 2: 로컬 샘플 시드 (둘러보기용)**

Create `scratchpad/phase3-seed.sql`:
```sql
delete from public.schedule_items;
delete from public.announcements;

insert into public.schedule_items(day, start_time, title, description, location, sort_order) values
  ('2026-09-05','15:00','등록 및 입실', null, null, 0),
  ('2026-09-05','18:00','저녁식사', null, '식당', 0),
  ('2026-09-05','19:30','개회 예배', '복된 만남 — 여는 예배', '대강당', 0),
  ('2026-09-06','06:00','새벽기도', null, '대강당', 0),
  ('2026-09-06','09:00','오전 집회', null, '대강당', 0),
  ('2026-09-06','12:00','점심식사', null, '식당', 0),
  ('2026-09-06','14:00','오후 프로그램 (가족 레크리에이션)', null, null, 0),
  ('2026-09-06','19:30','저녁 집회', null, '대강당', 0),
  ('2026-09-07','09:00','폐회 예배', null, '대강당', 0),
  ('2026-09-07','11:00','정리 및 귀가', null, null, 0);

insert into public.announcements(title, body, pinned, published) values
  ('회비 납부 안내', '회비는 배정된 객실 인원 기준으로 책정됩니다.\n등록 후 ‘내 등록 수정’에서 가구별 금액을 확인하실 수 있습니다.', true, true),
  ('수련회 준비물', '성경, 필기구, 세면도구, 편한 복장을 준비해 주세요.', false, true),
  ('(임시저장) 셔틀버스 시간', '아직 확정 전입니다.', false, false);
```

Run: `docker exec -i supabase_db_retreat2026 psql -U postgres -d postgres < scratchpad/phase3-seed.sql`
Expected: `DELETE` ×2, `INSERT 0 10`, `INSERT 0 3`.

- [ ] **Step 3: 엔드투엔드 스모크 (비로그인 + 관리자)**

`npm run dev` 실행 중. 확인:
- 비로그인 `/schedule`: 9/5~9/7 그룹·시간순 10개 항목.
- 비로그인 `/announcements`: "회비 납부 안내"(고정·상단) + "수련회 준비물" 2개만. "(임시저장)…"은 **안 보임**.
- 관리자 `/admin/announcements`: 임시저장 포함 3개 모두 보임("숨김" 배지).
- 헤더 전 링크 이동 + 모바일 햄버거.

- [ ] **Step 4: CLAUDE.md 갱신**

`## ▶ 현재 상태 / 다음 작업` 섹션:
- 완료 줄에 `Phase 3(스케줄+콘텐츠) ✅` 추가.
- 다음 작업을 **Phase 4 — 대시보드/현황**으로 변경.

`## 단계 로드맵`에서 Phase 3 줄을 `✅ (완료)`로 표시하고 실제 산출물 요약 추가:
```
- **Phase 3 — 스케줄 + 콘텐츠 ✅ (완료)**: 공개 콘텐츠(`/about`,`/speakers`,`/contact` 정적 i18n)
  + 스케줄(`/schedule`, `schedule_items`)·공지(`/announcements`, `announcements`) DB(공개읽기 RLS),
  관리자 `/admin/schedule`·`/admin/announcements`, 반응형 헤더+모바일 햄버거.
```

`## 디렉토리 구조` 의 마이그레이션 목록에 `0003_content.sql` 추가, 신규 페이지/컴포넌트 반영(`about/`,`schedule/`,`speakers/`,`announcements/`,`contact/`,`admin/(protected)/schedule`·`announcements`, `ScheduleManager`,`AnnouncementManager`,`ScheduleView`,`MobileNav`, `lib/schedule.ts`).

`messages/{ko,en}.json` 줄의 네임스페이스 목록에 `About/Schedule/Speakers/Announcements/Contact` 추가.

- [ ] **Step 5: 메모리 갱신**

`memory/next-session.md`를 Phase 4 시작점으로 갱신(일시중단 지점·로컬 재기동은 동일). `MEMORY.md` 인덱스의 next-session 줄 설명을 "Phase 4 시작점"으로 수정.

- [ ] **Step 6: Commit (문서)**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(phase3): CLAUDE.md 로드맵/구조 갱신 (Phase 3 완료)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```
(메모리 파일은 git 추적 대상이 아니면 커밋 생략.)

- [ ] **Step 7: 브랜치 마무리**

`superpowers:finishing-a-development-branch` 스킬로 병합/PR 옵션 진행. (모든 검증 통과 후)

---

## Self-Review

**1. Spec coverage** (스펙 각 항목 → 태스크 매핑):
- 데이터 모델(schedule_items/announcements) → Task 1 ✅
- RLS 공개읽기/관리자쓰기 → Task 1 ✅
- 타입·번역정책 → Task 2(타입), Task 3(i18n) ✅
- `/about`·`/speakers`·`/contact`(정적, 지도링크) → Task 8 ✅
- `/schedule`(DB) → Task 6, 관리 → Task 4 ✅
- `/announcements`(DB, 본문전체, 고정먼저, 게시필터) → Task 7, 관리 → Task 5 ✅
- 관리자 서브내비 +2 → Task 4 Step 4 ✅
- 반응형 헤더 + 모바일 햄버거 → Task 9 ✅
- 검증(마이그레이션/RLS/CRUD/공개/빈상태/내비/스모크) → Task 1·4·5·6·7·8·9·10 ✅
- 범위 밖(상세페이지/리치텍스트/종료시각/강사 채움/캐싱) → 미구현(의도적) ✅

**2. Placeholder scan:** "TBD/추후" 류는 강사 페이지의 **의도된 콘텐츠**(tbaName)뿐, 계획 단계 placeholder 없음. 모든 코드 스텝에 완전한 코드 포함.

**3. Type consistency:** `ScheduleItem`/`Announcement` 필드명이 Task 2 정의와 Task 4~7 사용처에서 일치. 액션 시그니처(`upsertScheduleItem`/`deleteScheduleItem`/`upsertAnnouncement`/`deleteAnnouncement`/`toggleAnnouncementFlag(id, "pinned"|"published", value)`)가 컴포넌트 호출과 일치. 헬퍼명(`groupByDay`/`formatDayLabel`/`formatTime`) 정의·사용 일치. i18n 키가 사용처와 일치(예: `Schedule.comingSoon`, `Announcements.emptyPublic`, `Contact.viewMap`).
