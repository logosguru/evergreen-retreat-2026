# 홈 Single Page + 언어 쿠키 유지 + Footer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈(`/`)을 hero + 소개/일정/강사/FAQ 단일 페이지로 재구성하고, top nav는 섹션 점프, 언어 선택은 쿠키로 지속, 하단에 copyright·관리자 로그인 footer 추가.

**Architecture:** 기존 4개 콘텐츠 페이지의 렌더링 로직을 순수 프레젠테이션 섹션 컴포넌트(`Hero`, `AboutSection`, `SpeakersSection`, `ScheduleSection`, `FaqSection`)로 추출한다. 홈 `page.tsx`는 async 서버 컴포넌트가 되어 `schedule_items`·`faqs`를 한 번에 fetch하고 각 섹션에 props로 주입한다(섹션은 데이터 fetch를 하지 않음). 기존 `/about`·`/schedule`·`/speakers`·`/faq`는 홈 앵커로 locale-aware `redirect`. nav 링크는 hash 앵커(`/#about`)로 바꾸고 `scroll-behavior: smooth`를 켠다. footer는 루트 레이아웃에 삽입.

**Tech Stack:** Next.js 16 (App Router, Turbopack), next-intl v4 (`localePrefix: 'as-needed'`, locales ko/en/es), Tailwind CSS v4, Supabase(`@supabase/ssr`).

## Global Constraints

- Next.js 16 규칙: 미들웨어는 `proxy.ts`, 코드 작성 전 `node_modules/next/dist/docs/` 관련 가이드 확인(AGENTS.md).
- next-intl: locale-aware 네비게이션은 **반드시 `@/i18n/navigation`의 `Link`/`redirect`/`usePathname`/`useRouter`** 사용. `next/link`·`next/navigation` 직접 사용 금지.
- next-intl v4 서버 `redirect`는 `redirect({ href, locale })` 형태이며 **locale 인자 필수**.
- async 서버 컴포넌트에서는 `useTranslations` 사용 불가 → 데이터 fetch하는 `page.tsx`는 `getTranslations` 또는 하위 **non-async** 컴포넌트에서 `useTranslations` 사용.
- `useTranslations`는 컴포넌트 상단에서만 호출(콜백/조건문 안에서 호출 금지).
- DB enum·표시 문자열은 messages로 번역. UI 문자열 하드코딩 금지 → footer/섹션 라벨은 messages(ko/en/es 3개 모두).
- 회비/방/등록/관리자 로직은 **변경하지 않음**(비목표).
- 테스트 러너 없음 → 각 태스크 검증 = `npm run lint` + `npx tsc --noEmit` + (해당 시) `npm run build` + 브라우저 확인(Playwright MCP). 실제 데이터에는 로컬 Supabase(`supabase start`) 필요.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/components/Hero.tsx` | 신규. 홈 hero(주제·성구·날짜·장소 + 등록/수정 CTA). `useTranslations("Home")`. |
| `src/components/AboutSection.tsx` | 신규. 소개 섹션(`id="about"`). `useTranslations("About")`. |
| `src/components/SpeakersSection.tsx` | 신규. 강사 섹션(`id="speakers"`). `useTranslations("Speakers")`. |
| `src/components/ScheduleSection.tsx` | 신규. 일정 섹션(`id="schedule"`). props `items: ScheduleItem[]`. `useTranslations("Schedule")` + `ScheduleView`. |
| `src/components/FaqSection.tsx` | 신규. FAQ 섹션(`id="faq"`). props `items: Faq[]`. `useTranslations("Faq")`. |
| `src/components/SiteFooter.tsx` | 신규. copyright + 관리자 로그인. `useTranslations("Footer")`. |
| `src/app/[locale]/page.tsx` | 수정. async 서버 컴포넌트로 전환, 데이터 fetch + 섹션 합성. |
| `src/app/[locale]/about/page.tsx` | 수정. `/#about`로 redirect. |
| `src/app/[locale]/speakers/page.tsx` | 수정. `/#speakers`로 redirect. |
| `src/app/[locale]/schedule/page.tsx` | 수정. `/#schedule`로 redirect. |
| `src/app/[locale]/faq/page.tsx` | 수정. `/#faq`로 redirect. |
| `src/components/SiteHeader.tsx` | 수정. nav href를 hash 앵커로. |
| `src/components/MobileNav.tsx` | 수정 없음(props로 받은 href 그대로 사용) — SiteHeader가 hash href 전달. |
| `src/app/[locale]/layout.tsx` | 수정. `<SiteFooter/>` 삽입. |
| `src/components/LocaleSwitcher.tsx` | 수정. 전환 시 `NEXT_LOCALE` 쿠키 명시 set. |
| `src/app/globals.css` | 수정. `html { scroll-behavior: smooth }`. |
| `messages/{ko,en,es}.json` | 수정. `Footer` 네임스페이스 추가. |

---

## Task 1: Footer (messages + SiteFooter + layout)

독립적으로 검증 가능(모든 페이지 하단에 footer 표시).

**Files:**
- Modify: `messages/ko.json`, `messages/en.json`, `messages/es.json`
- Create: `src/components/SiteFooter.tsx`
- Modify: `src/app/[locale]/layout.tsx`

**Interfaces:**
- Consumes: 없음.
- Produces: `SiteFooter` (default-free named export `export function SiteFooter()`), messages `Footer.copyright` / `Footer.adminLogin`.

- [ ] **Step 1: `Footer` 네임스페이스 추가 (ko)**

`messages/ko.json`의 최상위 객체에 아래 키를 추가(기존 키 유지, 알맞은 위치에):

```json
"Footer": {
  "copyright": "© 2026 늘푸른교회 (Evergreen Church)",
  "adminLogin": "관리자 로그인"
}
```

- [ ] **Step 2: `Footer` 네임스페이스 추가 (en)**

`messages/en.json`:

```json
"Footer": {
  "copyright": "© 2026 Evergreen Church",
  "adminLogin": "Admin login"
}
```

- [ ] **Step 3: `Footer` 네임스페이스 추가 (es)**

`messages/es.json`:

```json
"Footer": {
  "copyright": "© 2026 Iglesia Evergreen",
  "adminLogin": "Acceso de administrador"
}
```

- [ ] **Step 4: `SiteFooter` 컴포넌트 작성**

Create `src/components/SiteFooter.tsx`:

```tsx
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function SiteFooter() {
  const t = useTranslations("Footer");

  return (
    <footer className="mt-auto border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-slate-500 sm:flex-row">
        <p>{t("copyright")}</p>
        <Link href="/admin/login" className="hover:text-slate-700">
          {t("adminLogin")}
        </Link>
      </div>
    </footer>
  );
}
```

- [ ] **Step 5: 레이아웃에 footer 삽입**

Modify `src/app/[locale]/layout.tsx` — `SiteHeader` import 아래에 `SiteFooter` import 추가하고, `<main>` 뒤에 `<SiteFooter/>`를 넣는다:

```tsx
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
```

```tsx
        <NextIntlClientProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </NextIntlClientProvider>
```

(body는 이미 `min-h-full flex flex-col`, main은 `flex-1`이라 footer는 `mt-auto`로 하단 고정된다.)

- [ ] **Step 6: 검증 (lint + typecheck)**

Run: `npm run lint && npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 7: Commit**

```bash
git add messages/ko.json messages/en.json messages/es.json src/components/SiteFooter.tsx "src/app/[locale]/layout.tsx"
git commit -m "$(printf 'feat(footer): copyright + 관리자 로그인 footer 추가\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2: 섹션 컴포넌트 추출 (Hero, About, Speakers, Schedule, Faq)

기존 페이지의 JSX를 순수 프레젠테이션 컴포넌트로 옮긴다. 이 태스크만으로는 화면 변화가 없지만(아직 어디서도 렌더 안 함) 다음 태스크가 소비한다. 검증은 lint+tsc.

**Files:**
- Create: `src/components/Hero.tsx`, `src/components/AboutSection.tsx`, `src/components/SpeakersSection.tsx`, `src/components/ScheduleSection.tsx`, `src/components/FaqSection.tsx`

**Interfaces:**
- Consumes: `ScheduleView` (`@/components/ScheduleView`), types `ScheduleItem`·`Faq` (`@/lib/types`), `Link` (`@/i18n/navigation`).
- Produces:
  - `export function Hero()`
  - `export function AboutSection()`
  - `export function SpeakersSection()`
  - `export function ScheduleSection({ items }: { items: ScheduleItem[] })`
  - `export function FaqSection({ items }: { items: Faq[] })`

- [ ] **Step 1: `Hero` 컴포넌트 (기존 홈 hero 이동)**

Create `src/components/Hero.tsx` — 기존 `page.tsx`의 카드 JSX를 그대로 옮긴다:

```tsx
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function Hero() {
  const t = useTranslations("Home");

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200 sm:p-12">
        <p className="text-sm font-medium text-emerald-700">{t("title")}</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          {t("theme")}
        </h1>
        <blockquote className="mt-4 border-l-4 border-emerald-200 pl-4 text-base italic leading-relaxed text-slate-600">
          &ldquo;{t("verse")}&rdquo;
          <footer className="mt-1 text-sm not-italic text-slate-400">
            — {t("verseRef")}
          </footer>
        </blockquote>
        <ul className="mt-6 list-disc space-y-1 pl-5 text-sm text-slate-600 marker:text-emerald-500">
          <li>{t("dates")}</li>
          <li>
            {t("location")}
            <span className="block text-slate-400">{t("address")}</span>
          </li>
        </ul>
        <p className="mt-6 text-lg leading-relaxed text-slate-700">{t("intro")}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/register"
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-3 text-base font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            {t("registerCta")}
          </Link>
          <Link
            href="/edit"
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-5 py-3 text-base font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t("editCta")}
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `AboutSection` 컴포넌트 (기존 /about 이동)**

Create `src/components/AboutSection.tsx` — 기존 about `page.tsx` 본문을 `<section id="about">`로 감싸 옮긴다. 최상위 wrapper에 `scroll-mt-8` 추가:

```tsx
import { useTranslations } from "next-intl";

export function AboutSection() {
  const t = useTranslations("About");

  return (
    <section id="about" className="mx-auto max-w-2xl scroll-mt-8 px-4 py-12">
      <h2 className="text-3xl font-bold text-slate-900">{t("title")}</h2>
      <p className="mt-2 text-emerald-700">{t("theme")}</p>
      <blockquote className="mt-4 border-l-4 border-emerald-200 pl-4 italic text-slate-600">
        &ldquo;{t("verse")}&rdquo;
        <footer className="mt-1 text-sm not-italic text-slate-400">
          — {t("verseRef")}
        </footer>
      </blockquote>
      <div className="mt-8 space-y-6 leading-relaxed text-slate-700">
        <section>
          <h3 className="text-lg font-semibold text-slate-900">{t("whenTitle")}</h3>
          <p>{t("when")}</p>
        </section>
        <section>
          <h3 className="text-lg font-semibold text-slate-900">{t("whereTitle")}</h3>
          <p>{t("where")}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/honors-haven.webp"
            alt="Honor's Haven Retreat & Conference"
            className="mt-3 w-full rounded-xl shadow-sm ring-1 ring-slate-200"
          />
          <a
            href="https://www.honorshaven.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm font-medium text-emerald-700 hover:text-emerald-800"
          >
            {t("whereLink")} →
          </a>
        </section>
        <section>
          <h3 className="text-lg font-semibold text-slate-900">{t("feeTitle")}</h3>
          <p className="whitespace-pre-line">{t("fee")}</p>
        </section>
        <section>
          <h3 className="text-lg font-semibold text-slate-900">{t("prepareTitle")}</h3>
          <p className="whitespace-pre-line">{t("prepare")}</p>
        </section>
      </div>
    </section>
  );
}
```

(원래 `h1`/`h2`였던 것을 단일 페이지 계층에 맞게 `h2`/`h3`로 낮춤.)

- [ ] **Step 3: `SpeakersSection` 컴포넌트 (기존 /speakers 이동)**

Create `src/components/SpeakersSection.tsx`:

```tsx
import { useTranslations } from "next-intl";

export function SpeakersSection() {
  const t = useTranslations("Speakers");

  return (
    <section id="speakers" className="mx-auto max-w-2xl scroll-mt-8 px-4 py-12">
      <h2 className="text-3xl font-bold text-slate-900">{t("title")}</h2>
      <div className="mt-8 rounded-xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
        <div className="mx-auto h-24 w-24 rounded-full bg-slate-100" aria-hidden />
        <p className="mt-4 font-semibold text-slate-800">{t("tbaName")}</p>
        <p className="text-sm text-slate-500">{t("tbaNote")}</p>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: `ScheduleSection` 컴포넌트 (기존 /schedule 렌더 이동)**

Create `src/components/ScheduleSection.tsx` — 데이터는 props로 받고 렌더만:

```tsx
import { useTranslations } from "next-intl";
import { ScheduleView } from "@/components/ScheduleView";
import type { ScheduleItem } from "@/lib/types";

export function ScheduleSection({ items }: { items: ScheduleItem[] }) {
  const t = useTranslations("Schedule");

  return (
    <section id="schedule" className="mx-auto max-w-2xl scroll-mt-8 px-4 py-12">
      <h2 className="text-3xl font-bold text-slate-900">{t("pageTitle")}</h2>
      {items.length === 0 ? (
        <p className="mt-6 text-slate-500">{t("comingSoon")}</p>
      ) : (
        <ScheduleView items={items} />
      )}
    </section>
  );
}
```

- [ ] **Step 5: `FaqSection` 컴포넌트 (기존 /faq 렌더 이동)**

Create `src/components/FaqSection.tsx`:

```tsx
import { useTranslations } from "next-intl";
import type { Faq } from "@/lib/types";

export function FaqSection({ items }: { items: Faq[] }) {
  const t = useTranslations("Faq");

  return (
    <section id="faq" className="mx-auto max-w-2xl scroll-mt-8 px-4 py-12">
      <h2 className="text-3xl font-bold text-slate-900">{t("pageTitle")}</h2>
      {items.length === 0 ? (
        <p className="mt-6 text-slate-500">{t("emptyPublic")}</p>
      ) : (
        <dl className="mt-8 space-y-6">
          {items.map((f) => (
            <div
              key={f.id}
              className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
            >
              <dt className="flex gap-2 text-lg font-semibold text-slate-900">
                <span className="text-emerald-600">Q.</span>
                {f.question}
              </dt>
              <dd className="mt-2 flex gap-2 whitespace-pre-wrap text-slate-600">
                <span className="font-semibold text-slate-400">A.</span>
                <span>{f.answer}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
```

- [ ] **Step 6: 검증 (lint + typecheck)**

Run: `npm run lint && npx tsc --noEmit`
Expected: 에러 없음. (아직 어디서도 import 안 하므로 "unused"는 안 뜸 — export라서.)

- [ ] **Step 7: Commit**

```bash
git add src/components/Hero.tsx src/components/AboutSection.tsx src/components/SpeakersSection.tsx src/components/ScheduleSection.tsx src/components/FaqSection.tsx
git commit -m "$(printf 'refactor(sections): 홈 섹션용 Hero/About/Speakers/Schedule/Faq 컴포넌트 추출\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 3: 홈 페이지를 single page로 재구성

`page.tsx`를 async 서버 컴포넌트로 바꿔 데이터 fetch + 섹션 합성. 이 태스크 후 홈에서 모든 콘텐츠가 보인다.

**Files:**
- Modify: `src/app/[locale]/page.tsx` (전체 교체)

**Interfaces:**
- Consumes: `Hero`, `AboutSection`, `SpeakersSection`, `ScheduleSection`, `FaqSection` (Task 2), `createClient` (`@/lib/supabase/server`), types `ScheduleItem`·`Faq`.
- Produces: 없음(페이지).

- [ ] **Step 1: `page.tsx` 전체 교체**

기존 schedule/faq 페이지의 쿼리를 그대로 사용(정렬 동일). Replace `src/app/[locale]/page.tsx` 전체:

```tsx
import { setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Hero } from "@/components/Hero";
import { AboutSection } from "@/components/AboutSection";
import { ScheduleSection } from "@/components/ScheduleSection";
import { SpeakersSection } from "@/components/SpeakersSection";
import { FaqSection } from "@/components/FaqSection";
import type { ScheduleItem, Faq } from "@/lib/types";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const [scheduleRes, faqRes] = await Promise.all([
    supabase
      .from("schedule_items")
      .select("*")
      .order("day")
      .order("start_time")
      .order("sort_order"),
    supabase.from("faqs").select("*").order("sort_order").order("created_at"),
  ]);

  const scheduleItems = (scheduleRes.data as ScheduleItem[] | null) ?? [];
  const faqItems = (faqRes.data as Faq[] | null) ?? [];

  return (
    <>
      <Hero />
      <AboutSection />
      <ScheduleSection items={scheduleItems} />
      <SpeakersSection />
      <FaqSection items={faqItems} />
    </>
  );
}
```

- [ ] **Step 2: 검증 (lint + typecheck + build)**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: 에러 없음, 빌드 성공.

- [ ] **Step 3: 브라우저 확인 (로컬 dev)**

먼저 로컬 Supabase와 dev 서버가 떠 있어야 함: `supabase start` (미기동 시) → `npm run dev`.
Playwright MCP로 `http://localhost:3000` 접속 → hero + `#about`/`#schedule`/`#speakers`/`#faq` 섹션이 순서대로 렌더되는지, 콘솔 에러 없는지 확인.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/page.tsx"
git commit -m "$(printf 'feat(home): 홈을 hero+소개/일정/강사/FAQ 단일 페이지로 재구성\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 4: 기존 콘텐츠 페이지를 홈 앵커로 redirect

`/about`·`/schedule`·`/speakers`·`/faq` 접속 시 홈 앵커로 이동. 콘텐츠 중복 제거.

**Files:**
- Modify: `src/app/[locale]/about/page.tsx`, `src/app/[locale]/speakers/page.tsx`, `src/app/[locale]/schedule/page.tsx`, `src/app/[locale]/faq/page.tsx` (각 전체 교체)

**Interfaces:**
- Consumes: `redirect` (`@/i18n/navigation`) — signature `redirect({ href, locale })`.
- Produces: 없음.

- [ ] **Step 1: `/about` → `/#about`**

Replace `src/app/[locale]/about/page.tsx` 전체:

```tsx
import { redirect } from "@/i18n/navigation";

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/#about", locale });
}
```

- [ ] **Step 2: `/speakers` → `/#speakers`**

Replace `src/app/[locale]/speakers/page.tsx` 전체 (위와 동일 패턴, href `"/#speakers"`, 함수명 `SpeakersPage`).

```tsx
import { redirect } from "@/i18n/navigation";

export default async function SpeakersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/#speakers", locale });
}
```

- [ ] **Step 3: `/schedule` → `/#schedule`**

Replace `src/app/[locale]/schedule/page.tsx` 전체 (href `"/#schedule"`, 함수명 `SchedulePage`):

```tsx
import { redirect } from "@/i18n/navigation";

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/#schedule", locale });
}
```

- [ ] **Step 4: `/faq` → `/#faq`**

Replace `src/app/[locale]/faq/page.tsx` 전체 (href `"/#faq"`, 함수명 `FaqPage`):

```tsx
import { redirect } from "@/i18n/navigation";

export default async function FaqPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/#faq", locale });
}
```

- [ ] **Step 5: 검증 (lint + typecheck + build)**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: 에러 없음. (build가 이 라우트들을 정적/동적으로 처리 — redirect는 문제 없음.)

- [ ] **Step 6: 브라우저 확인**

dev 서버에서 `http://localhost:3000/about` 접속 → `http://localhost:3000/#about`로 이동 후 소개 섹션으로 스크롤되는지 확인. `/en/about` → `/en#about`(또는 `/en/#about`) + about 섹션 확인.

- [ ] **Step 7: Commit**

```bash
git add "src/app/[locale]/about/page.tsx" "src/app/[locale]/speakers/page.tsx" "src/app/[locale]/schedule/page.tsx" "src/app/[locale]/faq/page.tsx"
git commit -m "$(printf 'feat(routes): 기존 소개/일정/강사/FAQ 페이지를 홈 앵커로 redirect\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 5: Nav 섹션 점프 + 부드러운 스크롤

nav 링크를 hash 앵커로 바꾸고 smooth scroll을 켠다.

**Files:**
- Modify: `src/components/SiteHeader.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `Link` (`@/i18n/navigation`) — hash 포함 string href 지원. `MobileNav`(props `links`)는 변경 없이 hash href를 그대로 받음.
- Produces: 없음.

- [ ] **Step 1: SiteHeader nav href를 hash 앵커로**

Modify `src/components/SiteHeader.tsx` — `links` 배열의 href를 앵커로 변경:

```tsx
  const links = [
    { href: "/#about", label: t("about") },
    { href: "/#schedule", label: t("schedule") },
    { href: "/#speakers", label: t("speakers") },
    { href: "/#faq", label: t("faq") },
  ] as const;
```

(나머지 SiteHeader/MobileNav 코드는 그대로 — MobileNav는 `l.href`를 그대로 `Link`에 넘기므로 hash가 전달된다.)

- [ ] **Step 2: 부드러운 스크롤 CSS**

Modify `src/app/globals.css` — `body` 규칙 위(또는 아래)에 추가:

```css
html {
  scroll-behavior: smooth;
}
```

- [ ] **Step 3: 검증 (lint + typecheck)**

Run: `npm run lint && npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 4: 브라우저 확인 (데스크톱 + 모바일)**

dev 서버에서:
- `http://localhost:3000` → 데스크톱 nav의 소개/일정/강사/FAQ 클릭 시 각 섹션으로 부드럽게 스크롤.
- `http://localhost:3000/register`에서 nav 클릭 시 홈의 해당 섹션으로 이동.
- Playwright로 뷰포트를 좁혀(예: 375px) 햄버거 메뉴 열고 링크 클릭 → 홈 섹션 이동 + 패널 닫힘.

- [ ] **Step 5: Commit**

```bash
git add src/components/SiteHeader.tsx src/app/globals.css
git commit -m "$(printf 'feat(nav): top nav를 홈 섹션 앵커 점프로 전환 + smooth scroll\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 6: 언어 선택 쿠키 지속

next-intl은 `NEXT_LOCALE` 쿠키 + `localeDetection`(기본 on)을 사용한다. 전환 시 쿠키를 명시적으로 set해 재방문 시 언어가 확실히 유지되게 하고, 브라우저로 검증한다.

**Files:**
- Modify: `src/components/LocaleSwitcher.tsx`

**Interfaces:**
- Consumes: `useRouter`/`usePathname` (`@/i18n/navigation`), `routing` (`@/i18n/routing`).
- Produces: 없음.

- [ ] **Step 1: 전환 시 `NEXT_LOCALE` 쿠키 명시 set**

Modify `src/components/LocaleSwitcher.tsx` — `onChange` 핸들러에서 `router.replace` 전에 쿠키를 심는다(1년 만료, path=/):

```tsx
      onChange={(e) => {
        const next = e.target.value as typeof locale;
        // next-intl 기본 쿠키명. 재방문 시 미들웨어가 이 쿠키로 로케일을 결정한다.
        document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`;
        router.replace(pathname, { locale: next });
      }}
```

(기존 `value={locale}` 및 나머지는 그대로. `aria-label`, options 유지.)

- [ ] **Step 2: 검증 (lint + typecheck)**

Run: `npm run lint && npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 브라우저 확인 — 쿠키 지속**

dev 서버에서 Playwright MCP로:
1. `http://localhost:3000` 접속(ko).
2. LocaleSwitcher로 `en` 선택 → URL `/en`으로 바뀌고 UI 영어.
3. `document.cookie`에 `NEXT_LOCALE=en` 확인(`browser_evaluate`로 `document.cookie` 읽기).
4. **루트 재방문**: `http://localhost:3000/` 로 이동 → `/en`으로 유지(또는 영어 콘텐츠)되는지 확인.
5. `es`로도 1회 반복 확인.

Expected: 재방문 시 마지막 선택 언어 유지.

- [ ] **Step 4: Commit**

```bash
git add src/components/LocaleSwitcher.tsx
git commit -m "$(printf 'feat(i18n): 언어 선택을 NEXT_LOCALE 쿠키에 저장해 재방문 시 유지\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 7: 전체 통합 검증

**Files:** 없음(검증 전용).

- [ ] **Step 1: 풀 빌드 + 타입 + 린트**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: 모두 통과.

- [ ] **Step 2: 브라우저 E2E 스모크 (Playwright MCP, 로컬 dev)**

`supabase start` + `npm run dev` 상태에서 확인:
- [ ] 홈: hero + 4개 섹션 순서 렌더, 콘솔 에러 없음.
- [ ] nav 4개 링크 → 해당 섹션 부드러운 스크롤.
- [ ] `/register`에서 nav 클릭 → 홈 섹션 이동.
- [ ] `/about`·`/schedule`·`/speakers`·`/faq` → 홈 앵커 redirect.
- [ ] footer: copyright + 관리자 로그인 링크(클릭 시 `/admin/login`).
- [ ] 언어 전환 후 루트 재방문 시 언어 유지(쿠키).
- [ ] 모바일 뷰포트(375px): 햄버거 nav 섹션 점프 + 패널 닫힘, footer 세로 정렬.

- [ ] **Step 3: 최종 상태 확인**

`git status`로 미커밋 변경 없는지 확인. 이상 없으면 완료.

---

## Self-Review 결과

**Spec coverage:**
- 요구사항 1(홈 single page) → Task 2·3. 2(등록 별도 유지) → 변경 안 함(Hero의 `/register` 링크 유지, RegisterMenu 그대로). 3(nav 섹션 점프) → Task 5. 4(언어 쿠키) → Task 6. 5(footer) → Task 1. 기존 페이지 처리(spec §3) → Task 4. 모두 태스크 존재.

**Placeholder scan:** "TBD"/"적절히 처리" 류 없음. 모든 코드 스텝에 실제 코드 포함.

**Type consistency:** 섹션 컴포넌트 시그니처(`ScheduleSection({items: ScheduleItem[]})`, `FaqSection({items: Faq[]})`)가 Task 2 정의와 Task 3 소비에서 일치. `redirect({href, locale})`는 next-intl v4 설치본 타입(`createNavigation.d.ts:318`)에서 확인함. `SiteFooter`/`Hero` 등 named export 일관.

**Ambiguity:** hero 위치(맨 위), 기존 페이지 처리(redirect), footer 구성(copyright+admin)은 brainstorming에서 확정. Nav의 등록/LocaleSwitcher는 명시적으로 변경 제외.
