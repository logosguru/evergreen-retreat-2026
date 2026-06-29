import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import type { Faq } from "@/lib/types";

export default async function FaqPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data } = await supabase
    .from("faqs")
    .select("*")
    .order("sort_order")
    .order("created_at");

  const t = await getTranslations("Faq");
  const items = (data as Faq[] | null) ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-bold text-slate-900">{t("pageTitle")}</h1>
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
    </div>
  );
}
