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
