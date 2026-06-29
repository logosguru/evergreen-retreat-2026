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
