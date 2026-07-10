import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { Link } from "@/i18n/navigation";
import { TopoRings } from "./TopoField";

const rise = (ms: number) => ({ "--delay": `${ms}ms` }) as CSSProperties;

export function Hero() {
  const t = useTranslations("Home");
  const locale = useLocale();

  return (
    <section className="relative isolate overflow-hidden bg-pine-deep">
      {/* 배경 사진 + 오버레이 */}
      <div className="absolute inset-0 -z-10">
        <Image
          src="/venue/hero-lake.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-pine-deep via-pine-deep/70 to-pine-deep/30" />
        <div className="absolute inset-0 bg-gradient-to-br from-pine-deep/60 via-transparent to-transparent" />
      </div>

      {/* 시그니처 등고선 */}
      <TopoRings
        animate
        className="pointer-events-none absolute -right-24 top-1/2 hidden h-[135%] w-auto -translate-y-1/2 text-gold/40 md:block"
      />

      <div className="mx-auto flex min-h-[88vh] max-w-6xl flex-col justify-end px-6 pb-20 pt-36 sm:px-8">
        <div className="max-w-2xl">
          <p
            className="animate-rise text-lg font-normal leading-snug tracking-tight text-gold-soft sm:text-2xl"
            style={rise(0)}
          >
            {t("title")}
          </p>

          <h1
            className="animate-rise font-display-ko mt-6 text-[3.75rem] font-extrabold leading-[0.95] tracking-tight text-white sm:text-8xl"
            style={rise(140)}
          >
            {t("theme")}
          </h1>
          {locale !== "en" && (
            <p
              className="animate-rise font-display mt-1 text-3xl italic text-gold-soft sm:text-4xl"
              style={rise(230)}
            >
              Blessed Encounter
            </p>
          )}

          <blockquote
            className="animate-rise font-display mt-7 max-w-xl text-lg italic leading-relaxed text-ivory/85"
            style={rise(340)}
          >
            &ldquo;{t("verse")}&rdquo;
            <footer className="font-sans mt-2 text-sm not-italic tracking-wide text-ivory/55">
              — {t("verseRef")}
            </footer>
          </blockquote>

          <div
            className="animate-rise mt-8 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ivory/80"
            style={rise(430)}
          >
            <span>{t("dates")}</span>
            <span className="text-gold">✦</span>
            <span>{t("location")}</span>
          </div>

          <div
            className="animate-rise mt-9 flex flex-col gap-3 sm:flex-row"
            style={rise(520)}
          >
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-full bg-gold px-8 py-4 text-base font-semibold text-pine-deep shadow-lg shadow-black/25 transition hover:-translate-y-0.5 hover:bg-gold-soft"
            >
              {t("registerCta")}
            </Link>
            <Link
              href="/edit"
              className="inline-flex items-center justify-center rounded-full border border-ivory/35 bg-white/5 px-8 py-4 text-base font-semibold text-ivory backdrop-blur-sm transition hover:bg-white/15"
            >
              {t("editCta")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
