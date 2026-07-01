# 홈 Single Page + 언어 쿠키 유지 + Footer — 설계

- **날짜**: 2026-07-01
- **상태**: 설계 확정 (구현 대기)
- **범위**: 홈 페이지를 소개+일정+강사+FAQ 단일 페이지로 재구성, top nav 섹션 점프, 언어 선택 쿠키 지속, footer 추가

## 배경 / 목적

현재 홈(`/`)은 hero + 등록/수정 CTA만 있고, 소개·일정·강사·FAQ는 각각 독립 페이지(`/about`, `/schedule`, `/speakers`, `/faq`)로 분리돼 있다. 방문자가 수련회 정보를 한눈에 훑기 어렵다. 이를 **홈 단일 페이지**로 통합하고, top nav는 해당 섹션으로 점프하게 한다. 등록은 계속 별도 페이지로 유지한다. 추가로 언어 선택을 쿠키에 저장해 재방문 시 유지하고, 하단에 copyright·관리자 로그인 footer를 넣는다.

## 요구사항

1. 홈(`/`)을 single page로: 기존 hero 유지 + 소개→일정→강사→FAQ 섹션.
2. 등록 페이지(`/register`)는 기존과 동일하게 별도 유지.
3. top nav는 기존 구성 유지하되 4개 링크가 홈의 해당 섹션으로 점프.
4. 언어 선택을 쿠키에 저장 → 재방문 시 선택 언어 유지.
5. footer: copyright + 관리자 로그인 링크.

## 설계

### 1. 홈 페이지 구조 (`src/app/[locale]/page.tsx`)

서버 컴포넌트 유지. `schedule_items`·`faqs`를 홈에서 한 번에 fetch(기존 `/schedule`·`/faq` 페이지의 쿼리 재사용)하고, 아래 순서로 섹션 렌더:

```
[Hero]        기존 홈 hero (주제·성구·날짜·장소 + 등록/수정 CTA) — 그대로 유지
<section id="about">     AboutSection
<section id="schedule">  ScheduleSection (schedule_items props)
<section id="speakers">  SpeakersSection
<section id="faq">       FaqSection (faqs props)
```

각 `<section>`은 `id`(about/schedule/speakers/faq)와 `scroll-mt-*`(고정 헤더 높이 보정)을 갖는다.

### 2. 콘텐츠 컴포넌트 추출 (중복 방지)

기존 4개 페이지의 렌더링 로직을 재사용 가능한 섹션 컴포넌트로 추출:

- `AboutSection` — 기존 `/about` 정적 i18n 콘텐츠(장소 사진 `public/honors-haven.webp`, 홈페이지 링크, 준비물)를 그대로 이동.
- `SpeakersSection` — 기존 `/speakers` 정적 i18n 콘텐츠.
- `ScheduleSection` — `schedule_items`를 props로 받아 기존 `ScheduleView`(날짜 그룹, 일요일=주일/Lord's Day)로 렌더.
- `FaqSection` — `faqs`를 props로 받아 질문/답변 렌더.

각 섹션은 자체 제목(h2)과 앵커를 포함. 데이터 fetch는 섹션 컴포넌트가 아니라 홈 페이지(서버 컴포넌트)에서 수행하고 props로 주입 → 섹션은 순수 프레젠테이션.

### 3. 기존 페이지 → 앵커 리다이렉트

`/about`, `/schedule`, `/speakers`, `/faq` 의 `page.tsx`는 각각 홈 앵커로 `redirect()`:

- `/about` → `/#about`, `/schedule` → `/#schedule`, `/speakers` → `/#speakers`, `/faq` → `/#faq`
- next-intl locale-aware redirect 사용(`@/i18n/navigation`의 `redirect`). 기존 딥링크·북마크 유지, 콘텐츠 중복 없음.

### 4. Top Nav — 섹션 점프 (`SiteHeader.tsx`, `MobileNav.tsx`)

- nav 링크 `href`를 `/about` → `/#about` 형태(hash)로 변경. locale-aware `Link` + hash.
- 다른 페이지(`/register` 등)에서 클릭 시에도 홈의 해당 섹션으로 이동.
- 부드러운 스크롤: `globals.css`에 `html { scroll-behavior: smooth }` (또는 `scroll-smooth`).
- 등록(RegisterMenu)·LocaleSwitcher는 변경 없음. 로고 클릭(`/`)도 그대로.
- 모바일 햄버거(MobileNav)도 동일하게 hash 링크로. 링크 클릭 시 패널 닫힘 유지.

### 5. 언어 쿠키 지속

next-intl v4는 기본적으로 `NEXT_LOCALE` 쿠키 + `localeDetection`(기본 on)을 사용한다. 언어 전환(`router.replace(pathname, {locale})`) 시 쿠키가 심어지고, 재방문 시 `/` 접속하면 미들웨어(`proxy.ts`의 `createMiddleware(routing)`)가 쿠키 기반으로 로케일을 결정한다.

- **구현 시 브라우저로 실제 검증**: en으로 전환 → 쿠키 확인 → `/` 재방문 시 `/en`(또는 en 콘텐츠) 유지되는지.
- 만약 전환 시 쿠키가 안 심기면 LocaleSwitcher에서 `NEXT_LOCALE` 쿠키를 명시적으로 set(1년 만료). 그 외 routing 옵션 조정이 필요하면 최소 변경.

### 6. Footer (`components/SiteFooter.tsx` + `layout.tsx`)

루트 레이아웃(`src/app/[locale]/layout.tsx`)의 `<main>` 아래에 `SiteFooter` 추가. body는 이미 `min-h-full flex flex-col`, main은 `flex-1` → footer는 `mt-auto`로 자연히 하단.

- `© 2026 늘푸른교회 (Evergreen Church)` — i18n(messages `Footer` 네임스페이스).
- `관리자 로그인` → `/admin/login` 링크(locale-aware).
- 스타일: 작은 회색 텍스트, 상단 얇은 구분선(border-t), 절제된 톤.

### 7. i18n 메시지

- `Footer` 네임스페이스 추가(`copyright`, `adminLogin`) — ko/en/es 3개 파일.
- 섹션 제목 등 기존 메시지(About/Schedule/Speakers/Faq/Home) 최대한 재사용.

## 파일 변경 요약

| 파일 | 변경 |
|---|---|
| `src/app/[locale]/page.tsx` | hero 유지 + 4개 섹션 합성, schedule/faq fetch |
| `src/components/{About,Speakers,Schedule,Faq}Section.tsx` | 신규(기존 페이지 로직 추출) |
| `src/app/[locale]/{about,schedule,speakers,faq}/page.tsx` | 홈 앵커로 redirect |
| `src/components/SiteHeader.tsx`, `MobileNav.tsx` | nav href를 hash 앵커로 |
| `src/components/SiteFooter.tsx` | 신규 |
| `src/app/[locale]/layout.tsx` | SiteFooter 삽입 |
| `src/components/LocaleSwitcher.tsx` | (검증 후 필요 시) 쿠키 명시 set |
| `src/app/globals.css` | scroll-behavior smooth |
| `messages/{ko,en,es}.json` | Footer 네임스페이스 |

## 비목표 (YAGNI)

- 등록/수정 플로우 변경 없음.
- 관리자 영역 변경 없음.
- 새 콘텐츠 추가 없음(기존 콘텐츠 재배치만).
- footer에 추가 링크(교회 홈페이지 등) 넣지 않음 — copyright + 관리자 로그인만.

## 검증 계획

- `npm run build` + `npx tsc --noEmit` 통과.
- 로컬(`supabase start` + `npm run dev`)에서 브라우저로:
  - 홈에서 nav 클릭 시 각 섹션으로 스크롤.
  - `/register`에서 nav 클릭 시 홈 섹션으로 이동.
  - `/about` 등 접속 시 홈 앵커로 리다이렉트.
  - 언어 전환 후 재방문(새 탭/쿠키 유지) 시 언어 유지.
  - footer 표시 + 관리자 로그인 링크 동작.
  - 모바일(햄버거) 동작.
