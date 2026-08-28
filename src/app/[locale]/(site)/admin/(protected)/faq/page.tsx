import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { FaqManager } from "@/components/FaqManager";
import type { Faq } from "@/lib/types";

export default async function AdminFaqPage({
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

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">{t("manageTitle")}</h1>
      <FaqManager items={(data as Faq[] | null) ?? []} />
    </div>
  );
}
