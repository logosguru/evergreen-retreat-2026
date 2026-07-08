# 일정 "언어별 진행" 표시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 일정 항목에 "언어별 진행" 플래그를 두어, 관리자가 체크박스로 지정하고 공개 일정에서 badge + 좌측 보더 톤으로 구분해 보여준다.

**Architecture:** `schedule_items`에 `by_language boolean` 컬럼(0016)을 추가한다. 관리자 폼(ScheduleManager)에 체크박스를 달고 `upsertScheduleItem` 화이트리스트에 필드를 추가한다. 공개 뷰(ScheduleView)는 `by_language`가 true인 항목에 locale별 badge와 좌측 보더를 렌더한다. 권한은 기존 schedule_items 관리자쓰기 RLS + 서버 액션 화이트리스트로 보호된다(신규 정책 없음).

**Tech Stack:** Next.js 16(App Router, 서버 액션) · Supabase(@supabase/ssr, RLS) · next-intl v4 · TypeScript · Tailwind v4

**Spec:** `docs/superpowers/specs/2026-07-08-schedule-by-language-design.md`

## Global Constraints

- **컬럼**: `schedule_items.by_language boolean not null default false`. 기존 행은 전부 false.
- **권한**: `by_language`는 관리자 전용 — 기존 schedule_items 관리자쓰기 RLS + `upsertScheduleItem` 화이트리스트에서만 전송. 신규 RLS 정책 없음.
- **badge 문구**(i18n): `byLanguageBadge` = `언어별 진행` / `By Language` / `Por idioma`. 관리자 체크박스 라벨 `byLanguageLabel` = `언어별 진행` / `By language` / `Por idioma`.
- **회귀 없음**: by_language=false 항목의 공개/관리자 렌더는 기존과 동일.
- **Supabase**: 서버 클라이언트 `@/lib/supabase/server`의 `createClient()`(async).
- **i18n**: `useTranslations`는 컴포넌트 상단에서만. **ko/en/es 3파일 키 파리티 필수**.
- **문구 규칙**: '교우' 금지 → '성도'. 스페인어 usted체.
- **검증 도구**(단위 테스트 러너 없음): `npx tsc --noEmit`, `npm run lint`, `npm run build`, `supabase db reset` + `docker exec -i supabase_db_retreat2026 psql -U postgres -d postgres`, `npm run dev` + Playwright MCP.
- **커밋 메시지** 말미: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- 작업 브랜치: `schedule-by-language` (Task 1 Step 0에서 생성).

---

### Task 1: 마이그레이션 0016 + ScheduleItem 타입

**Files:**
- Create: `supabase/migrations/0016_schedule_by_language.sql`
- Modify: `src/lib/types.ts` (ScheduleItem 인터페이스)

**Interfaces:**
- Produces: `schedule_items.by_language boolean not null default false`; `ScheduleItem.by_language: boolean`.

- [ ] **Step 0: 브랜치 생성**

Run: `git checkout -b schedule-by-language`

- [ ] **Step 1: 마이그레이션 작성**

Create `supabase/migrations/0016_schedule_by_language.sql`:
```sql
-- 언어별로 흩어져 진행하는 순서(성경공부 등) 표시. 기본 false.
alter table public.schedule_items
  add column by_language boolean not null default false;
```

- [ ] **Step 2: 타입 추가**

`src/lib/types.ts`의 `ScheduleItem` 인터페이스에서 `sort_order: number;` 다음 줄에 추가:
```ts
  by_language: boolean;
```

- [ ] **Step 3: 마이그레이션 적용 + 검증**

Run: `supabase db reset` (꺼져 있으면 `supabase start` 먼저; Docker 필요)
그다음:
```bash
docker exec -i supabase_db_retreat2026 psql -U postgres -d postgres -c "\d public.schedule_items" | grep by_language
```
Expected: `by_language | boolean | not null default false` 한 줄 출력.

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0016_schedule_by_language.sql src/lib/types.ts
git commit -m "feat(db): schedule_items.by_language 컬럼 + 타입(0016)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: i18n 키 추가 (ko/en/es)

**Files:**
- Modify: `messages/ko.json`, `messages/en.json`, `messages/es.json` — `Schedule` 네임스페이스

**Interfaces:**
- Produces: `Schedule.byLanguageBadge`, `Schedule.byLanguageLabel` (3 locale).

- [ ] **Step 1: ko.json**

`messages/ko.json`의 `Schedule` 네임스페이스 마지막 키(`delete`) 뒤에 추가(콤마 주의):
```json
"byLanguageBadge": "언어별 진행",
"byLanguageLabel": "언어별 진행"
```

- [ ] **Step 2: en.json**

`messages/en.json`의 `Schedule` 네임스페이스 마지막 키 뒤에 추가:
```json
"byLanguageBadge": "By Language",
"byLanguageLabel": "By language"
```

- [ ] **Step 3: es.json**

`messages/es.json`의 `Schedule` 네임스페이스 마지막 키 뒤에 추가:
```json
"byLanguageBadge": "Por idioma",
"byLanguageLabel": "Por idioma"
```

- [ ] **Step 4: 파리티 검증**

Run:
```bash
python3 -c "
import json
ks = {loc: set(json.load(open(f'messages/{loc}.json'))['Schedule'].keys()) for loc in ['ko','en','es']}
assert ks['ko']==ks['en']==ks['es'], (ks['ko']^ks['en'], ks['ko']^ks['es'])
print('Schedule parity OK', len(ks['ko']), 'keys')
assert {'byLanguageBadge','byLanguageLabel'} <= ks['ko']
print('new keys present')
"
```
Expected: `Schedule parity OK 16 keys` + `new keys present`.

- [ ] **Step 5: Commit**

```bash
git add messages/ko.json messages/en.json messages/es.json
git commit -m "feat(i18n): 일정 언어별 진행 badge/라벨 ko/en/es

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 관리자 — 서버 액션 + ScheduleManager 체크박스

**Files:**
- Modify: `src/app/[locale]/admin/schedule-actions.ts`
- Modify: `src/components/ScheduleManager.tsx`

**Interfaces:**
- Consumes: `ScheduleItem.by_language`(Task 1), `Schedule.byLanguageLabel`(Task 2).
- Produces: `upsertScheduleItem` 입력에 `by_language?: boolean`.

- [ ] **Step 1: 서버 액션에 by_language 추가**

`src/app/[locale]/admin/schedule-actions.ts` 수정.

(a) `upsertScheduleItem` 입력 타입에서 `sort_order?: number;` 다음 줄에 추가:
```ts
  by_language?: boolean;
```
(b) `row` 객체에서 `sort_order: input.sort_order ?? 0,` 다음 줄에 추가:
```ts
    by_language: input.by_language ?? false,
```

- [ ] **Step 2: ScheduleManager 체크박스**

`src/components/ScheduleManager.tsx` 수정.

(a) state 추가 — `const [time, setTime] = useState("09:00");` 다음 줄에:
```ts
  const [byLanguage, setByLanguage] = useState(false);
```
(b) `reset()`에서 `setTime("09:00");` 다음 줄에 추가:
```ts
    setByLanguage(false);
```
(c) `submit()`의 `upsertScheduleItem({ ... })` 호출에 `by_language` 추가 — `start_time: time,` 다음 줄에:
```ts
        by_language: byLanguage,
```
(d) `editItem(it)`에서 `setTime(formatTime(it.start_time));` 다음 줄에 추가:
```ts
    setByLanguage(it.by_language);
```
(e) 날짜/시간 입력 `div`(`className="flex flex-wrap items-center gap-2"`) 안, `<input ... type="time" ... />` 다음에 체크박스 추가:
```tsx
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={byLanguage}
                onChange={(e) => setByLanguage(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              {t("byLanguageLabel")}
            </label>
```
(f) 관리자 목록 행에서 by_language 항목 표시 — 목록 `<span>{formatTime(it.start_time)} · {it.title}</span>` 다음에 추가:
```tsx
                  {it.by_language && (
                    <span className="ml-2 inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      {t("byLanguageBadge")}
                    </span>
                  )}
```

- [ ] **Step 3: 정적 검증**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 모두 오류 없음.

- [ ] **Step 4: 브라우저 검증(관리자)**

사전: `supabase start` + `npm run dev`. 관리자 로그인은 이 환경에서 Google OAuth라 어려우면, psql로 항목 seed 후 공개 뷰는 Task 4에서 검증하고, 여기서는 **폼 저장 경로**를 관리자 세션 없이 확인하기 어려우므로 최소한 아래 psql 왕복으로 서버 액션 화이트리스트가 컬럼을 쓰는지 확인한다:
```bash
docker exec -i supabase_db_retreat2026 psql -U postgres -d postgres -c "insert into public.schedule_items (day, start_time, title, by_language) values ('2026-09-06','10:00','성경공부', true) returning id, title, by_language;"
```
Expected: 삽입된 행에 `by_language = t`. (관리자 로그인이 가능하면 /admin/schedule에서 체크박스 체크→저장→목록 badge 표시, 재편집 시 체크 유지, 해제→저장→badge 사라짐까지 확인. 로그인 불가 시 그 사실을 report에 명시하고 psql 왕복으로 대체.)
검증 후 seed 행 삭제:
```bash
docker exec -i supabase_db_retreat2026 psql -U postgres -d postgres -c "delete from public.schedule_items where title='성경공부' and by_language;"
```

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/admin/schedule-actions.ts" src/components/ScheduleManager.tsx
git commit -m "feat(admin): 일정 언어별 진행 체크박스 + 액션 화이트리스트

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 공개 — ScheduleView badge + 보더 톤

**Files:**
- Modify: `src/components/ScheduleView.tsx`

**Interfaces:**
- Consumes: `ScheduleItem.by_language`(Task 1), `Schedule.byLanguageBadge`(Task 2).

- [ ] **Step 1: badge + 보더 렌더**

`src/components/ScheduleView.tsx` 수정.

(a) import에 `useTranslations` 추가 — 기존 `import { useLocale } from "next-intl";`를 다음으로 교체:
```ts
import { useLocale, useTranslations } from "next-intl";
```
(b) 컴포넌트 상단(`const locale = useLocale();` 다음 줄)에 추가:
```ts
  const t = useTranslations("Schedule");
```
(c) `<li key={it.id} className="flex gap-4">`를 by_language일 때 좌측 보더 톤을 주도록 교체:
```tsx
                <li
                  key={it.id}
                  className={
                    it.by_language
                      ? "flex gap-4 border-l-2 border-indigo-300 pl-3"
                      : "flex gap-4"
                  }
                >
```
(d) 제목 `<p>` 안, `{localized(it, "title", locale)}` 다음(그리고 location span 앞)에 badge 추가:
```tsx
                      {localized(it, "title", locale)}
                      {it.by_language && (
                        <span className="ml-2 inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                          {t("byLanguageBadge")}
                        </span>
                      )}
```

- [ ] **Step 2: 정적 검증**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: 모두 오류 없음.

- [ ] **Step 3: 브라우저 검증(공개)**

사전: `supabase start` + `npm run dev`. psql로 언어별/일반 항목 각각 seed:
```bash
docker exec -i supabase_db_retreat2026 psql -U postgres -d postgres <<'SQL'
insert into public.schedule_items (day, start_time, title, title_en, title_es, by_language) values
  ('2026-09-06','10:00','성경공부','Bible Study','Estudio bíblico', true),
  ('2026-09-06','11:00','전체 집회','General Session','Sesión general', false);
SQL
```
http://localhost:3000/schedule 에서 (Playwright MCP):
1. "성경공부" 항목에 indigo badge("언어별 진행") + 좌측 보더 표시.
2. "전체 집회" 항목엔 badge/보더 없음(기존 스타일).
3. `/en/schedule` → badge "By Language", `/es/schedule` → "Por idioma".
4. 콘솔 에러 0.
5. cleanup:
```bash
docker exec -i supabase_db_retreat2026 psql -U postgres -d postgres -c "delete from public.schedule_items where day='2026-09-06' and start_time in ('10:00:00','11:00:00');"
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ScheduleView.tsx
git commit -m "feat(schedule): 공개 일정 언어별 진행 badge + 보더 톤

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 배포 메모 (계획 범위 밖, 병합 후)

- 프로덕션 Supabase에 0016을 **코드 배포보다 먼저** 적용(`supabase db push --linked`) — 안 하면 공개/관리자 일정 쿼리가 없는 컬럼을 참조해 실패.
- main 병합·push 시 Vercel 자동 배포.
