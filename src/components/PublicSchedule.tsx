"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import type { ScheduleItem } from "@/lib/types";
import { groupByDay, formatDayLabel, formatTime } from "@/lib/schedule";
import { etWallClock, findNowNext, type NowNext } from "@/lib/schedule-now";
import { localized } from "@/lib/localized";

const NO_HIGHLIGHT: NowNext = { nowIds: [], nextIds: [] };

// 이름표 QR로 들어오는 언어별 일정 전용 화면.
// 사이트 헤더/푸터 없이 일정에만 집중하고, 수련회 기간 중에는 '지금/다음' 순서를 강조한다.
export function PublicSchedule({ items }: { items: ScheduleItem[] }) {
  const locale = useLocale();
  const t = useTranslations("Schedule");
  const tCommon = useTranslations("Common");
  const tHome = useTranslations("Home");

  const groups = useMemo(() => groupByDay(items), [items]);

  // 서버 렌더 시점엔 강조 없음 → hydration mismatch 방지. 마운트 후 1분 간격 갱신.
  const [highlight, setHighlight] = useState<NowNext>(NO_HIGHLIGHT);
  useEffect(() => {
    const update = () => setHighlight(findNowNext(items, etWallClock(new Date())));
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [items]);

  const nowSet = useMemo(() => new Set(highlight.nowIds), [highlight.nowIds]);
  const nextSet = useMemo(() => new Set(highlight.nextIds), [highlight.nextIds]);

  // 강조 대상(지금 → 없으면 다음) 첫 항목: 최초 진입 시 자동 스크롤 + '지금 순서 보기' 대상
  const focusId = highlight.nowIds[0] ?? highlight.nextIds[0] ?? null;
  const scrollToFocus = (behavior: ScrollBehavior) => {
    if (!focusId) return;
    document
      .getElementById(`item-${focusId}`)
      ?.scrollIntoView({ behavior, block: "center" });
  };

  const autoScrolled = useRef(false);
  useEffect(() => {
    if (!focusId || autoScrolled.current) return;
    autoScrolled.current = true;
    scrollToFocus("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  // 현재 순서가 이미 화면에 보이면 되돌아가기 버튼은 감춘다 (하단 내용 가림 방지).
  // 초기값 true = 버튼 숨김 — observe 직후 콜백이 실제 가시성으로 바로 덮어쓴다.
  const [focusVisible, setFocusVisible] = useState(true);
  useEffect(() => {
    if (!focusId) return;
    const el = document.getElementById(`item-${focusId}`);
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setFocusVisible(entry.isIntersecting),
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [focusId]);

  // 날짜 헤더의 sticky 오프셋 = 상단 바 실제 높이. 언어별 텍스트 길이에 따라 헤더가
  // 한 줄 더 늘어날 수 있어 매직넘버 대신 실측값을 CSS 변수로 넘긴다.
  const topBarRef = useRef<HTMLElement>(null);
  const [topBarHeight, setTopBarHeight] = useState<number | null>(null);
  useEffect(() => {
    const el = topBarRef.current;
    if (!el) return;
    const measure = () => setTopBarHeight(el.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const dayHeaderTop = topBarHeight === null ? "107px" : `${topBarHeight}px`;

  const otherLocales = routing.locales.filter((l) => l !== locale);
  const localeLabel: Record<string, string> = {
    ko: tCommon("langKo"),
    en: tCommon("langEn"),
    es: tCommon("langEs"),
  };

  return (
    <main className="flex-1 pb-24">
      {/* 상단 바 — 스크롤해도 언어 전환이 항상 손에 닿도록 sticky */}
      <header
        ref={topBarRef}
        className="sticky top-0 z-20 border-b border-gold/25 bg-pine text-ivory shadow-sm"
      >
        <div className="mx-auto max-w-2xl px-4 py-3 sm:px-6">
          <p className="font-display text-lg font-bold leading-tight text-gold-soft sm:text-xl">
            {tHome("theme")}
          </p>
          <p className="mt-0.5 text-[13px] leading-snug text-ivory/75">
            {tHome("dates")}
            <span className="hidden sm:inline"> · {tHome("location")}</span>
          </p>
          <nav
            aria-label={t("otherLanguages")}
            className="mt-2.5 flex flex-wrap gap-1.5"
          >
            {routing.locales.map((loc) => {
              const current = loc === locale;
              return (
                <Link
                  key={loc}
                  href="/schedule"
                  locale={loc}
                  aria-current={current ? "page" : undefined}
                  className={`rounded-full px-3 py-1 text-[13px] font-semibold transition ${
                    current
                      ? "bg-gold text-pine-deep"
                      : "border border-ivory/30 text-ivory/85 hover:bg-white/10"
                  }`}
                >
                  {localeLabel[loc]}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <h1 className="font-display-ko text-2xl font-bold text-pine sm:text-3xl">
          {t("pageTitle")}
        </h1>

        {groups.length === 0 ? (
          <p className="mt-8 rounded-2xl bg-white/70 px-5 py-10 text-center text-bark-soft ring-1 ring-line">
            {t("comingSoon")}
          </p>
        ) : (
          <div className="mt-6 space-y-9">
            {groups.map((g) => (
              <section key={g.day}>
                {/* 날짜 헤더도 sticky — 긴 목록에서 지금 보는 날짜를 놓치지 않게 */}
                <h2
                  style={{ top: dayHeaderTop }}
                  className="sticky z-10 -mx-1 flex items-baseline gap-2 rounded-lg bg-background/95 px-1 py-2 font-display-ko text-xl font-bold text-pine backdrop-blur"
                >
                  <span className="text-gold">✦</span>
                  {formatDayLabel(g.day, locale)}
                </h2>

                <ul className="mt-2 space-y-2.5">
                  {g.items.map((it) => {
                    const isNow = nowSet.has(it.id);
                    const isNext = nextSet.has(it.id);
                    const location = localized(it, "location", locale);
                    const description = localized(it, "description", locale);
                    return (
                      <li
                        key={it.id}
                        id={`item-${it.id}`}
                        style={{ scrollMarginTop: `calc(${dayHeaderTop} + 3rem)` }}
                        className={`rounded-xl border px-4 py-3.5 transition ${
                          isNow
                            ? "border-moss bg-moss/12 ring-2 ring-moss/40"
                            : isNext
                              ? "border-gold/50 bg-cream"
                              : "border-line bg-white/70"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`text-lg font-bold tabular-nums ${
                              isNow ? "text-moss" : "text-bark-soft"
                            }`}
                          >
                            {formatTime(it.start_time)}
                          </span>
                          {isNow && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-moss px-2.5 py-0.5 text-xs font-bold text-white">
                              <span aria-hidden>●</span>
                              {t("nowBadge")}
                            </span>
                          )}
                          {isNext && (
                            <span className="inline-flex rounded-full bg-gold/20 px-2.5 py-0.5 text-xs font-bold text-gold">
                              {t("nextBadge")}
                            </span>
                          )}
                          {it.by_language && (
                            <span className="ml-auto inline-flex rounded-full bg-moss/15 px-2 py-0.5 text-[11px] font-medium text-moss">
                              {t("byLanguageBadge")}
                            </span>
                          )}
                        </div>

                        <p className="mt-1 text-[17px] font-semibold leading-snug text-bark">
                          {localized(it, "title", locale)}
                        </p>

                        {location && (
                          <p className="mt-1 flex items-start gap-1 text-sm text-bark-soft">
                            <span aria-hidden className="text-moss-soft">
                              ◆
                            </span>
                            <span>{location}</span>
                          </p>
                        )}

                        {description && (
                          <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-bark-soft">
                            {description}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        <footer className="mt-10 space-y-4 border-t border-line pt-6 text-sm">
          <p className="text-xs text-bark-soft/70">{t("subjectToChange")}</p>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-bark-soft/60">
              {t("otherLanguages")}
            </p>
            <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
              {otherLocales.map((loc) => (
                <Link
                  key={loc}
                  href="/schedule"
                  locale={loc}
                  className="font-semibold text-moss underline decoration-moss/40 underline-offset-4 hover:text-pine"
                >
                  {localeLabel[loc]}
                </Link>
              ))}
            </p>
          </div>
          <Link
            href="/"
            className="inline-block font-semibold text-moss underline decoration-moss/40 underline-offset-4 hover:text-pine"
          >
            {t("backToHome")} →
          </Link>
        </footer>
      </div>

      {/* 스크롤로 벗어났을 때 현재 순서로 되돌아가는 버튼 (기간 중에만 노출) */}
      {focusId && !focusVisible && (
        <button
          type="button"
          onClick={() => scrollToFocus("smooth")}
          className="fixed bottom-5 left-1/2 z-30 -translate-x-1/2 rounded-full bg-pine px-5 py-2.5 text-sm font-bold text-ivory shadow-lg ring-1 ring-gold/40 transition hover:bg-pine-deep"
        >
          {t("jumpToNow")}
        </button>
      )}
    </main>
  );
}
