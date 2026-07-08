import { useTranslations } from "next-intl";

// 강사별 사진은 정적 데이터(번역 불필요), 문구는 messages/Speakers.

export function SpeakersSection() {
  const t = useTranslations("Speakers");

  return (
    <section id="speakers" className="mx-auto max-w-4xl scroll-mt-8 px-4 py-12">
      <h2 className="text-3xl font-bold text-slate-900">{t("title")}</h2>
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* 정정원 목사 */}
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/speakers/jung-jungwon.jpg"
            alt={t("s1Name")}
            width={220}
            height={220}
            className="mx-auto h-24 w-24 rounded-full object-cover ring-2 ring-emerald-100"
          />
          <p className="mt-4 text-center text-lg font-semibold text-slate-900">
            {t("s1Name")}
          </p>
          <p className="text-center text-sm text-slate-500">{t("church")}</p>
          <p className="mt-4 whitespace-pre-line text-sm leading-6 text-slate-600">
            {t("s1Bio")}
          </p>
        </div>

        {/* 박선희 선교사 */}
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/speakers/park-sunhee.jpg"
            alt={t("s2Name")}
            width={120}
            height={120}
            className="mx-auto h-24 w-24 rounded-full object-cover ring-2 ring-emerald-100"
          />
          <p className="mt-4 text-center text-lg font-semibold text-slate-900">
            {t("s2Name")}
          </p>
          <p className="text-center text-sm text-slate-500">{t("church")}</p>
          <p className="mt-4 whitespace-pre-line text-sm leading-6 text-slate-600">
            {t("s2Bio")}
          </p>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-slate-400">{t("bioNote")}</p>
    </section>
  );
}
