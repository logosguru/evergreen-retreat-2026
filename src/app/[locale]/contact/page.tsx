import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";

const VENUE_ADDRESS =
  "Honor's Haven Retreat & Conference, 1195 Arrowhead Rd, Ellenville, NY 12428";
const CHURCH_ADDRESS = "20 Andrews Road, Hicksville, NY 11801";

function mapUrl(q: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export default function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = use(params);
  setRequestLocale(locale);

  const t = useTranslations("Contact");

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-12">
      <h1 className="text-3xl font-bold text-slate-900">{t("title")}</h1>

      <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">{t("venueTitle")}</h2>
        <p className="mt-2 text-slate-700">Honor&apos;s Haven Retreat &amp; Conference</p>
        <p className="text-slate-600">1195 Arrowhead Rd, Ellenville, NY 12428</p>
        <a
          href={mapUrl(VENUE_ADDRESS)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-sm font-medium text-emerald-700 hover:text-emerald-800"
        >
          {t("viewMap")} →
        </a>
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">{t("churchTitle")}</h2>
        <p className="mt-2 text-slate-700">20 Andrews Road, Hicksville, NY 11801</p>
        <p className="text-slate-600">
          {t("phoneLabel")}:{" "}
          <a
            href="tel:+15168226464"
            className="text-emerald-700 hover:text-emerald-800"
          >
            (516) 822-6464
          </a>
        </p>
        <p className="text-slate-600">
          {t("emailLabel")}:{" "}
          <a
            href="mailto:info@nyevergreen.com"
            className="text-emerald-700 hover:text-emerald-800"
          >
            info@nyevergreen.com
          </a>
        </p>
        <a
          href={mapUrl(CHURCH_ADDRESS)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-sm font-medium text-emerald-700 hover:text-emerald-800"
        >
          {t("viewMap")} →
        </a>
      </section>
    </div>
  );
}
