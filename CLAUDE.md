@AGENTS.md

# CLAUDE.md

이 파일은 이 저장소에서 작업하는 Claude(및 개발자)를 위한 컨텍스트 문서입니다.
(상단 `@AGENTS.md` 는 create-next-app이 관리하는 Next.js 16 규칙 — 유지)

## ▶ 현재 상태 / 다음 작업 (이어서 시작)

- **🚀 배포 LIVE**: **https://retreat.nyevergreen.com** (2026-06-30). Vercel(프로젝트/GitHub repo = `evergreen-retreat-2026`) + Supabase 호스팅(ref `gkdhifnworjtnnubrpft`). 공개 등록·Turnstile·Supabase·관리자 Google 로그인·keep-alive cron 전부 검증 완료.
- **완료**: Phase 1~4 ✅ + Spanish(es) UI ✅ + **출시 준비 코드 ✅**(Turnstile 봇 방지 · keep-alive cron · 배포 설정 — `docs/superpowers/{specs,plans}/2026-06-30-deploy-prep*`) — 모두 `main` 병합·배포됨.
- **배포 구성 요약**: Supabase 마이그레이션 0001~0007 + Access Token Hook(Postgres `custom_access_token_hook`) 활성화 / Google OAuth(관리자, 첫 관리자 logosguru@gmail.com) / Resend SMTP(`send.nyevergreen.com`, sender `noreply@send.nyevergreen.com`) + 매직링크 템플릿(ko/en/es, token_hash→`/auth/confirm`) / URL Config(Site URL=배포 URL) / Turnstile hostnames=retreat.nyevergreen.com+localhost / Route53 CNAME `retreat`→Vercel / Vercel Deployment Protection=Standard(커스텀 도메인 공개).
- **Vercel env(6)**: `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`·`SUPABASE_SECRET_KEY`·`CRON_SECRET`(All) + `NEXT_PUBLIC_TURNSTILE_SITE_KEY`·`TURNSTILE_SECRET_KEY`(Production만). ⚠️ **env 추가/수정 후 반드시 Redeploy** (안 하면 반영 안 됨; 값에 따옴표/공백 섞이면 서버 Supabase 쿼리가 조용히 500).
- **🔒 신규 등록 마감 (2026-08-18)**: `lib/types.ts` 의 `REGISTRATION_OPEN = false` 하나로 제어 — 헤더/모바일/Hero/CtaBand 의 등록 CTA 숨김(수정 CTA만 노출), `/register` 는 마감 안내 + 수정 링크, `insertRegistration()` 서버 액션도 거부. **이메일/이름 확인 + 이메일 신청 흐름과 `/edit` 는 계속 열려 있음.** 다시 열려면 상수를 `true` 로 바꿔 배포.
- **📱 이름표 QR 일정 (2026-08-28)**: 이름표 뒷면 인쇄용 **언어별 공개 일정 페이지** 3개 —
  `retreat.nyevergreen.com/schedule` (한국어) · `/en/schedule` · `/es/schedule`.
  사이트 헤더/푸터 없는 전용 화면(`[locale]/schedule/page.tsx` + `PublicSchedule`), 모바일 우선,
  설명·장소 항상 노출, 수련회 기간 중 **'지금/다음' 순서 강조 + 자동 스크롤**(`lib/schedule-now.ts`, 뉴욕 시각 기준).
  기존 홈 `#schedule` 섹션과 헤더 나브는 그대로. 인쇄용 QR = `public/qr/schedule-{ko,en,es}.{svg,png}` (`npm run qr`).
- **다음(선택)**: 실제 매직링크 수신 최종 확인, 필요 시 실 등록 데이터 관리. 새 기능은 **brainstorming → spec → writing-plans → subagent-driven** 패턴 유지.
- **로컬 개발 재기동**: `supabase start` → `npm run dev` (http://localhost:3000). 로컬 키는 `.env.local`(로컬 Supabase + Turnstile 키). 매직링크 메일은 Mailpit http://127.0.0.1:54324. 로컬은 로컬 Supabase를 가리키며 프로덕션과 분리됨.

## 프로젝트

뉴욕 **늘푸른교회(Evergreen Church, https://nyevergreen.com)** 전교인 하계 수련회 web app.
- **주제**: 복된 만남 / Blessed Encounter (출 29:43)
- 수련회: **2026-09-05(토) ~ 09-07(월)**, Honor's Haven Retreat & Conference (1195 Arrowhead Rd, Ellenville, NY 12428)
- **회비(객실 인원별, 1인 기준, 2박3일 숙박+식사 포함)**: 2인실 $300 / 3인실 $250 / 4인실 $200. **6세 미만 면제 + 객실 인원 미집계**. 가정당 1부만 제출.
  - **부분 참석**(주일만 참석, 숙박 없음): 성인 **$100 정액** / **6~12세 $50** — 객실 타입 단가 무관.
  - **6~12세 전일 참석**: **$100 정액** — 방 종류 무관 (객실 인원에는 집계).
  - **회비 면제**(`attendees.fee_waived`, 관리자 지정 — 초청 강사 등): **$0**, 객실 인원에는 집계.
    우선순위 = 면제 → 6세 미만 → 6~12세 → 부분/전일.
  - 구현: TS `lib/fees.ts` `personFee()` ↔ SQL `household_total()` (0024·0028). **두 곳을 항상 같이 고칠 것.**
- 두 사용자군:
  - **성도(Member)**: 등록, 본인 정보 수정, (추후) 수련회 소개·스케줄·강사·공지·연락처 열람
  - **관리자(교역자/준비위원)**: 대시보드, 참석자 관리, 방 배치, 스케줄 관리
- 완성 후 교회 도메인의 **서브도메인**으로 이전 예정.
- UI 언어: **한국어 기본 + 영어 전환(i18n)**.

## 확정된 제품 결정사항

| 항목 | 결정 |
|---|---|
| 성도 접근 | 로그인 없이 **누구나 링크로 등록** (anon INSERT) |
| 관리자 인증 | **Google 로그인**, **단일 관리자 역할** (이메일 allowlist `admins` 테이블) |
| 등록 단위 | **가구주 일괄 + 개인 둘 다** 지원 (self-FK `householder_id`) |
| 본인 수정 | **이메일 매직링크**로 본인 확인 후 수정 |
| 회비 | **관리자 수동 체크** (Phase 1엔 온라인 결제 없음) |

## 단계 로드맵

- **Phase 1 — 기반 ✅ (완료)**: 데이터 모델, 인증·권한, 공개 등록(가구주+개인), 성도 본인 수정, 관리자 참석자 관리(목록·출석·회비 토글), i18n.
- **Phase 2 — 방 배치 + 회비 ✅ (완료)**: 객실 타입/호실 관리(`/admin/rooms`), 참석자 호실 배치 + 정원 초과 경고 + 현황표(`/admin/assignments`), 사람별 회비 계산(6세미만 $0·미배정 미산정), 가구 단위 납부, 성도 회비 카드(`my_household_fee()` RPC).
- **Phase 3 — 스케줄 + 콘텐츠 ✅ (완료)**: 공개 콘텐츠(`/about`·`/speakers` 정적 i18n) + 스케줄(`/schedule`, `schedule_items`)·FAQ(`/faq`, `faqs`) DB(공개읽기 RLS + 관리자쓰기), 관리자 `/admin/schedule`·`/admin/faq`, 반응형 헤더 + 모바일 햄버거. (일요일 일정은 "주일/Lord's Day" 표기. 소개 페이지에 장소 사진/링크·준비물.)
- **Phase 4 — 대시보드 + 언어 ✅ (완료)**: 관리자 대시보드(`/admin`, 등록·언어·방배정·회비·구역·직분 집계, 컬러 카드) + 성도 언어 구분(`attendees.language` ko/en/es, 관리자 지정). 참석자 목록은 `/admin/attendees`로 이동.

> 데이터 모델/인증은 후속 단계를 수용하도록 설계됨.

## 스택 (2026-06 공식 문서 검증)

- **Next.js 16.2.9** App Router (Turbopack 기본, Node ≥ 20.9)
- **Supabase** (Postgres + Auth) — `@supabase/ssr` + `@supabase/supabase-js`
- **next-intl v4** (i18n)
- **Tailwind CSS v4**
- 배포: **Vercel** + **Supabase** 무료 티어

⚠️ **버전 주의 (옛 튜토리얼과 다름)**
- Next 16: 미들웨어는 **`proxy.ts` / `proxy()`** (구 `middleware.ts`). matcher는 `config` export로 읽음.
- Supabase: **`@supabase/auth-helpers-nextjs`는 deprecated** — `@supabase/ssr`만 사용. 쿠키 API는 `getAll()`/`setAll()`.
- 서버 세션 검증은 **`supabase.auth.getClaims()`** 사용 (`getSession()` 신뢰 금지).
- API 키: 브라우저/서버 `sb_publishable_...`, 서버 전용 `sb_secret_...` (레거시 anon/service_role JWT 키 아님).

## 명령어

```bash
npm run dev      # 개발 서버 (http://localhost:3000, 영어는 /en)
npm run build    # 프로덕션 빌드
npm run lint     # ESLint (Next 16엔 next lint 없음 → eslint 직접 실행)
npx tsc --noEmit # 타입체크
npm test         # node --test (src/**/*.test.ts)
npm run qr       # 이름표용 언어별 일정 QR 재생성 → public/qr/schedule-{ko,en,es}.{svg,png}
```

> 실제 동작에는 Supabase 설정이 필요. **`SETUP.md`** 참고 (현재 `.env.local`은 placeholder).

## 디렉토리 구조 (핵심)

```
src/
  proxy.ts                       # Next 16 미들웨어: next-intl 라우팅 + Supabase 세션 갱신
                                 #   + /schedule(한국어 QR)은 rewrite로 ko 고정 — 브라우저 언어 감지 무시
  i18n/{routing,request,navigation}.ts   # ko 기본, localePrefix: 'as-needed'
  lib/
    types.ts                     # Attendee(+language), enum, DISTRICTS, LANGUAGES, RoomType, Room, ScheduleItem, Faq
    fees.ts                      # 회비 계산: personFee, groupHouseholds, formatUSD, AttendeeWithRoom
    schedule.ts                  # 스케줄 날짜 그룹/요일·시간 포맷: groupByDay, formatDayLabel, formatTime
    schedule-now.ts              # QR 일정 '지금/다음' 판정(순수): etWallClock(America/New_York), findNowNext
    dashboard.ts                 # 대시보드 집계(순수): computeDashboard → DashboardStats (fees 재사용)
    xlsx.ts                      # 의존성 없는 최소 XLSX 작성기(무압축 ZIP + inlineStr): buildXlsx(XlsxSheet[])
    attendee-export.ts           # 참석자 Excel 시트 데이터(순수): buildAttendeeWorkbook — 라벨은 ExportLabels로 주입
    supabase/{client,server,middleware}.ts  # 브라우저/서버/proxy용 클라이언트
  app/
    [locale]/
      layout.tsx                 # <html> + 폰트 + NextIntlClientProvider 만 (루트 레이아웃)
      schedule/page.tsx          # ★ 이름표 QR 전용 언어별 일정 (PublicSchedule) — (site) 밖이라 헤더/푸터 없음
      (site)/                    # 라우트 그룹: SiteHeader + <main> + SiteFooter 공통 껍데기 (URL엔 영향 없음)
        layout.tsx               # 사이트 헤더/푸터
        page.tsx                 # 홈 (hero + CTA + #about/#schedule/#speakers/#faq 섹션)
        about|speakers/page.tsx  # 정적 콘텐츠(소개·강사, i18n). about에 장소 사진(public/honors-haven.webp)+홈페이지 링크·준비물
        faq/page.tsx             # 공개 FAQ(질문/답변, 정렬순) — faqs 공개읽기
        register/{page,actions}.tsx   # 공개 등록(이메일 먼저 확인 단계: 중복이면 차단+/edit 안내) + insertRegistration()/checkEmail() 서버 액션
        edit/
          page.tsx               # 매직링크 요청 (EditRequestForm)
          manage/page.tsx        # 링크 검증 후 본인 가구 행 수정 (EditForm) + 성도 회비 카드 (my_household_fee RPC)
          actions.ts             # updateMyAttendee() — 화이트리스트 컬럼만
        admin/
          login/page.tsx           # Google 로그인 (가드 밖)
          (protected)/             # 라우트 그룹: 권한 가드 적용 (URL엔 영향 없음)
            layout.tsx             # getClaims() → app_role=admin 확인 + 서브내비(대시보드/참석자/객실/방배치/일정/FAQ)
            page.tsx               # 대시보드 (AdminDashboard, computeDashboard 집계)
            attendees/page.tsx     # 참석자 정렬 표(사람당 1행, 참석·방타입·언어 정렬, 구역 열, 회비·납부·언어 인라인) — AdminAttendeeTable + lib/attendee-sort
                                   #   + [Excel 내보내기] → /api/admin/attendees/export?locale=
            rooms/page.tsx         # 객실 타입/호실 관리 (RoomManager)
            assignments/page.tsx   # 호실 배치 보드 + 정원경고 + 현황표 (AssignmentBoard)
            schedule/page.tsx      # 일정 CRUD (ScheduleManager)
            faq/page.tsx           # FAQ CRUD (FaqManager)
          actions.ts               # setPaid(), setLanguage() — 관리자 전용
          rooms-actions.ts         # 객실 타입/호실 CRUD
          assignment-actions.ts    # assignRoom() — 호실 배치
          schedule-actions.ts      # upsert/deleteScheduleItem — 관리자 전용
          faq-actions.ts           # upsert/deleteFaq — 관리자 전용
    auth/{callback,confirm,signout}/route.ts  # [locale] 밖, proxy matcher에서 제외
  components/                    # SiteHeader, MobileNav, RegisterMenu, LocaleSwitcher, *Form, AdminAttendeeTable, AdminDashboard, PersonFields, RoomManager, AssignmentBoard, HouseholdFeeCard, ScheduleManager, FaqManager, ScheduleView, PublicSchedule
scripts/generate-qr.mjs          # `npm run qr` — 이름표용 언어별 일정 QR (devDep: qrcode)
public/qr/schedule-{ko,en,es}.{svg,png}   # 인쇄용 QR (커밋됨; URL 바뀌면 npm run qr 재생성)
messages/{ko,en}.json            # i18n (…/Admin/…/Rooms/Fee/About/Schedule/Speakers/Faq/Language). 언어 라벨=Language(ko/en만, es UI 번역은 후속)
supabase/migrations/
  0001_init.sql                  # attendees/admins + RLS + 트리거 + access token hook + 첫 관리자
  0002_rooms.sql                 # room_types/rooms + attendees.room_id + my_household_fee() RPC + RLS
  0003_content.sql               # schedule_items/announcements + 공개읽기 RLS + 관리자쓰기 (announcements는 0004에서 제거)
  0004_faq.sql                   # faqs(공개읽기 RLS + 관리자쓰기) 신설 + announcements 제거(공지→FAQ 교체)
  0005_email_check.sql           # email_registered(text) SECURITY DEFINER RPC (등록 이메일 중복 확인, 명단 비노출)
  0006_email_unique.sql          # attendees.email partial unique 인덱스(lower(email), 중복 등록 DB 차단)
  0007_language.sql              # attendees.language enum(ko/en/es, 기본 ko) + guard 트리거 보호(관리자 전용)
```

> **회비/방 규칙**: 회비 금액은 저장하지 않고 배정 호실의 타입 단가로 계산(6세미만 $0, 미배정 미산정). 납부는 가구주(head) 행의 `paid`를 가구 단위로 사용. 방 테이블(room_types/rooms)·`attendees.room_id`는 관리자 전용(RLS + guard 트리거), 성도는 `my_household_fee()` RPC로 금액만.

## 인증·권한 아키텍처 (중요)

- 관리자/성도 모두 같은 Supabase 프로젝트의 `auth.users`. **인증 방식으로 권한을 구분하지 않음.**
- `admins` 이메일 allowlist + **Custom Access Token Hook**(`public.custom_access_token_hook`)이
  토큰 발급 시 `app_metadata.app_role`에 `'admin'`/`'member'` 주입 → RLS에서 `public.is_admin()`로 읽음.
- **RLS (`attendees`)**: anon+authenticated INSERT(공개 등록) / 관리자 전체 SELECT·UPDATE·DELETE /
  성도는 본인 이메일·가구(`householder_id`) 행만 SELECT·UPDATE. anon SELECT 없음(명단 비노출).
- 관리자 전용 컬럼(`paid`,`paid_at`,`retreat_group`,`is_group_leader`,`is_householder`,`householder_id`)은
  RLS가 컬럼 제한을 못 하므로 **`guard_privileged_cols` BEFORE UPDATE 트리거**가 비관리자 변경을 OLD로 복원 +
  서버 액션에서도 화이트리스트만 전송.

## 컨벤션 / 주의점

- **서버 액션**으로 모든 폼 mutation. **Route Handler**는 OAuth 콜백·매직링크 confirm·signout + 파일 다운로드(Excel export)만.
- `/api/*` 는 `proxy.ts` matcher 제외 → 로케일이 없다. 번역이 필요하면 `?locale=` 로 받아 `getTranslations({ locale, namespace })` 사용.
  (Next는 `_`/`__` 로 시작하는 폴더를 라우팅에서 제외하므로 api 하위 폴더명에 쓰지 말 것)
- 인증 라우트는 `[locale]` **밖**(`src/app/auth/...`)에 두고 `proxy.ts` matcher에서 제외 (locale 재작성 방지).
- DB enum은 영문 토큰 저장, 화면 라벨은 messages로 번역 (직분 등). DB에 표시 문자열 저장 금지.
- **관리자 화면에서 가구(household) = "방"**. 스키마·코드(`householder_id`, `groupHouseholds` 등)는 그대로 두고
  `Admin` 네임스페이스 라벨만 방/방 대표로 쓴다. 배정된 물리 객실은 "호실"(`colRoom`). 성도 화면은 "가구/가족" 유지.
- 부분 참석 도착/출발은 **날짜만**(`date` 컬럼, 0011) + **선택 사항**(추후 확정 가능, partial이어도 null 허용). date input `min/max`=수련회 기간(`RETREAT_START/END` in lib/types). 폼 초기값은 `slice(0,10)`.
- **사이트 껍데기는 `(site)` 라우트 그룹**에 있다. 헤더/푸터 없는 화면(현재 QR `/schedule`)을 추가할 땐
  `(site)` **밖**에 두면 되고, `(site)` 안의 서버 액션을 컴포넌트에서 import할 땐 경로에 `(site)/`가 들어간다.
- **인쇄된 QR 링크의 로케일은 고정**이어야 한다. `localePrefix: 'as-needed'` 라 prefix 없는 한국어 경로는
  next-intl의 accept-language 감지에 걸려 `/en/...`으로 튄다 → `proxy.ts`에서 해당 경로만 rewrite로 ko 고정.
  QR 경로를 추가/변경하면 `proxy.ts`의 `KO_SCHEDULE_PATHS`와 `scripts/generate-qr.mjs`를 같이 고칠 것.
- 관리자 권한 클레임은 **로그인 시점**에 굳어짐 → `admins`에 나중에 추가된 사람은 **재로그인** 필요.
- 새 컴포넌트/페이지는 위 i18n·Supabase 패턴을 그대로 따를 것. `useTranslations`는 콜백 안에서 호출 금지(컴포넌트 상단에서).

## 미완 / 후속 (Phase 1 출시 전)

- **Cloudflare Turnstile** 미적용 — 공개 등록 폼 스팸 방지 (`register/actions.ts` TODO).
- **Custom SMTP(Resend)** + 매직링크 이메일 템플릿(token_hash) 설정 필요 — `SETUP.md` 참고. 내장 메일은 시간당 ~2통 제한.
- 무료 Supabase는 DB 7일 무활동 시 일시정지 → 수련회 전 keep-alive cron 권장.
