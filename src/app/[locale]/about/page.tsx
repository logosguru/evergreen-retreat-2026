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
        &ldquo;{t("verse")}&rdquo;
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
          <h2 className="text-lg font-semibold text-slate-900">{t("feeTitle")}</h2>
          <p className="whitespace-pre-line">{t("fee")}</p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-slate-900">
            {t("prepareTitle")}
          </h2>
          <p className="whitespace-pre-line">{t("prepare")}</p>
        </section>
      </div>
    </div>
  );
}
