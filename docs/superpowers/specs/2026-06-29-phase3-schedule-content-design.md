# Phase 3 — 스케줄 + 콘텐츠 페이지 설계

## Context (배경)

Evergreen Church 수련회 2026 web app의 Phase 3. Phase 1(등록·인증·참석자 관리·i18n)과
Phase 2(방 배치·회비)는 완료·검증됨. Phase 3은 **성도가 열람하는 콘텐츠 페이지**와 **관리자가
관리하는 스케줄·공지**를 추가한다.

대상 콘텐츠 5종:
- **수련회 소개** — 주제·말씀·일정·장소·회비 안내 (정적)
- **전체 스케줄** — 2026-09-05(토)~09-07(월) 날짜별 프로그램 (관리자 관리)
- **강사 소개** — 초청 강사 (현재 미정, 플레이스홀더)
- **공지사항** — 수련회 안내 글 (관리자 관리)
- **Contact us** — 교회 본부 + 수련회 장소 연락처/주소 (정적)

## 확정된 결정사항

| 항목 | 결정 |
|---|---|
| 콘텐츠 모델 | **하이브리드** — 스케줄·공지 = DB(관리자 편집), 소개·강사·Contact = 정적 i18n |
| 스케줄 항목 | 날짜 + 시작시각 + 제목 + (선택)설명 + (선택)장소. **종료시각 없음**(다음 항목으로 이어짐). 날짜별 그룹 표시 |
| 공지 | 제목 + 본문 + 고정(pinned) + 게시(published). **목록에서 본문 전체 표시**(상세 페이지 없음). 고정 먼저, 최신순 |
| 강사 | 사진+이름·직책+소개 **구조만** 만들고 플레이스홀더 1명("추후 공개"). 정적 i18n |
| 공개 읽기 | 스케줄·공지(게시분)는 **anon 포함 누구나 읽기**. Phase 2 방 테이블과 정반대 |
| DB 콘텐츠 번역 | 스케줄 제목/설명·공지 본문은 **관리자 자유 입력 → 번역 대상 아님**. UI 라벨만 i18n |
| 데이터 읽기 | 공개 페이지는 **서버 컴포넌트에서 Supabase 직접 읽기**(Phase 2 패턴). 캐시/정적 생성은 범위 밖 |
| 내비게이션 | **반응형 헤더 + 모바일 햄버거**. 데스크톱 링크 + 강조 "등록" 버튼 |
| Contact | 교회 본부 + 수련회 장소 정보 + **Google Maps 지도 링크** |

## 데이터 모델 — `supabase/migrations/0003_content.sql`

```sql
-- 스케줄 항목 (관리자 관리, 공개 읽기)
create table public.schedule_items (
  id          uuid primary key default gen_random_uuid(),
  day         date not null,            -- 2026-09-05 (토)
  start_time  time not null,            -- 18:00 (종료시각 없음 — 다음 항목으로 이어짐)
  title       text not null,
  description text,
  location    text,
  sort_order  int  not null default 0,  -- 동일 (day, start_time) 내 정렬 보조
  created_at  timestamptz not null default now()
);
create index schedule_items_day_idx on public.schedule_items (day, start_time, sort_order);

-- 공지사항 (관리자 관리, 공개는 published만)
create table public.announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  pinned       boolean not null default false,  -- 상단 고정
  published    boolean not null default true,   -- 임시저장/숨김
  published_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index announcements_order_idx on public.announcements (pinned desc, published_at desc);
create trigger trg_ann_updated before update on public.announcements
  for each row execute function public.set_updated_at();  -- Phase 1 함수 재사용
```

> **타임존 주의**(CLAUDE.md): `day`는 `date`, `start_time`은 `time` 타입이라 타임존 변환이 개입하지
> 않는다(wall-clock 그대로). 표시 시에도 Date 변환 없이 문자열/Intl 포맷만 사용.

**시드**: 마이그레이션엔 시드를 넣지 않는다(실제 프로그램 미확정 + 프로덕션 오염 방지). 로컬
둘러보기용 샘플은 별도 seed 스크립트로 투입.

## RLS — 공개 읽기 + 관리자 쓰기

```sql
alter table public.schedule_items enable row level security;
alter table public.announcements  enable row level security;

-- 스케줄: 누구나 읽기, 관리자만 쓰기
create policy "schedule_public_read" on public.schedule_items
  for select to anon, authenticated using (true);
create policy "schedule_admin_write" on public.schedule_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 공지: 공개는 published=true만, 관리자는 전부(미게시 포함)
create policy "ann_public_read" on public.announcements
  for select to anon, authenticated using (published);
create policy "ann_admin_all" on public.announcements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
```

- 다중 permissive 정책은 OR로 합쳐짐: 관리자는 `ann_admin_all`(SELECT 포함)로 미게시 포함
  전부 조회, 일반/anon은 `ann_public_read`로 게시분만.
- 스케줄·공지엔 관리자 전용 컬럼 보호 트리거(`guard_privileged_cols`)가 **불필요** — 비관리자는
  애초에 쓰기 정책이 없음(읽기 전용).

## 페이지 구성 (IA)

### 공개 페이지 (anon 읽기)

| 경로 | 내용 | 소스 | 비고 |
|---|---|---|---|
| `/about` | 수련회 소개 (주제·말씀·일정·장소·회비 안내·기대) | 정적 i18n | 홈 hero와 중복 최소화 — 홈은 요약+CTA, about은 상세 |
| `/schedule` | 전체 스케줄 — 날짜별 그룹 카드 | DB | 항목 없으면 "곧 공개" 안내 |
| `/speakers` | 강사 소개 | 정적 i18n | 플레이스홀더 1명("추후 공개") |
| `/announcements` | 공지 목록 — 고정 먼저, 최신순, 본문 전체 | DB | 항목 없으면 빈 상태 안내 |
| `/contact` | Contact us | 정적 i18n | 교회 본부 + 수련회 장소 + 지도 링크 |

**Contact 데이터**(i18n에 하드코딩):
- 교회 본부: 20 Andrews Road, Hicksville, NY 11801 / (516) 822-6464 / info@nyevergreen.com
- 수련회 장소: Honor's Haven Retreat & Conference, 1195 Arrowhead Rd, Ellenville, NY 12428
- 지도 링크: `https://www.google.com/maps/search/?api=1&query=<URL 인코딩 주소>` (새 탭)

### 관리자 페이지 (`(protected)` 그룹, 기존 서브내비에 +2)

- **`/admin/schedule`** — 스케줄 CRUD (`ScheduleManager`)
  - 액션: `upsertScheduleItem(form)`, `deleteScheduleItem(id)`
  - 입력: 날짜(date), 시작시각(time), 제목, 설명, 장소, 정렬. 날짜별 그룹 표시.
- **`/admin/announcements`** — 공지 CRUD + 고정/게시 토글 (`AnnouncementManager`)
  - 액션: `upsertAnnouncement(form)`, `deleteAnnouncement(id)`, `toggleAnnouncementFlag(id, field)`(pinned/published)

### 내비게이션

`SiteHeader`를 **반응형**으로 개편:
- 데스크톱(`sm:` 이상): 소개·스케줄·강사·공지·Contact 링크 + 강조된 "등록" 버튼 + LocaleSwitcher. "수정"은 메뉴/링크에 포함.
- 모바일: 햄버거 버튼 → 토글로 같은 링크를 세로 메뉴로 펼침. 클라이언트 컴포넌트(`MobileNav`)로 토글 상태 관리, 라우트 변경 시 닫힘.
- 관리자 서브내비(protected layout): 기존 참석자/객실/방배치 + **스케줄·공지** 링크 추가.

## 회비/방과의 관계
없음. Phase 3은 독립적인 콘텐츠 레이어 — attendees/rooms/fees 로직 변경 없음.

## 컴포넌트/파일 (신규·수정)

신규:
- `supabase/migrations/0003_content.sql`
- 공개 페이지: `src/app/[locale]/about/page.tsx`, `schedule/page.tsx`, `speakers/page.tsx`,
  `announcements/page.tsx`, `contact/page.tsx`
- `src/app/[locale]/admin/(protected)/schedule/page.tsx` + `ScheduleManager`
- `src/app/[locale]/admin/(protected)/announcements/page.tsx` + `AnnouncementManager`
- `src/app/[locale]/admin/schedule-actions.ts`, `announcement-actions.ts`
- `src/components/MobileNav.tsx` (또는 SiteHeader 내부 분리), `ScheduleView.tsx`, `AnnouncementList.tsx`
- `src/lib/schedule.ts` — 날짜 그룹·요일 라벨 헬퍼(타임존 안전, Intl 기반)

수정:
- `src/components/SiteHeader.tsx` — 반응형 + 신규 링크
- `src/app/[locale]/admin/(protected)/layout.tsx` — 서브내비 +2
- `src/lib/types.ts` — `ScheduleItem`, `Announcement` 타입
- `messages/ko.json`, `messages/en.json` — `About`, `Schedule`, `Speakers`, `Announcements`,
  `Contact` 네임스페이스 + `Nav`/`Admin` 키 추가

## 검증 (Verification)

- **마이그레이션**: `supabase db reset` → `schedule_items`/`announcements` 생성, 인덱스·트리거 확인.
- **RLS**:
  - anon이 스케줄 SELECT 가능, **미게시 공지(published=false)는 안 보임**, 게시 공지는 보임.
  - anon/비관리자 INSERT/UPDATE/DELETE **차단**. 관리자는 전부 가능(미게시 포함 조회).
- **관리자 CRUD**: 스케줄 항목 생성·수정·삭제(날짜별 그룹). 공지 생성·수정·삭제 + 고정/게시 토글.
- **공개 페이지**: `/schedule` 날짜별 그룹·시간순. `/announcements` 고정-먼저·최신순·본문 전체.
  `/about`·`/speakers`·`/contact` 한/영 전환. Contact 지도 링크 동작.
- **빈 상태**: 스케줄/공지 0건일 때 안내 문구.
- **내비**: 데스크톱 링크 + 모바일 햄버거 토글, 라우트 변경 시 닫힘. 한/영 라벨.
- **agent-browser 스모크**: 샘플 데이터로 공개 페이지 + 관리자 CRUD 1회씩.

## 비고 / 범위 밖 (후속)
- 공지 상세 페이지·첨부파일·리치 텍스트(마크다운 렌더)는 범위 밖(목록 본문은 줄바꿈 보존 plain text).
- 스케줄 종료시각·세션별 강사 연결·캘린더 내보내기(ics)는 범위 밖.
- 강사 정보 실제 채움(사진 포함)은 정보 확정 후.
- 콘텐츠 캐싱/정적 생성 최적화는 Phase 4 이후 트래픽 보고 판단.
- 전체 대시보드 집계는 Phase 4.
