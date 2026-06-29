import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ScheduleView } from "@/components/ScheduleView";
import type { ScheduleItem } from "@/lib/types";

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data } = await supabase
    .from("schedule_items")
    .select("*")
    .order("day")
    .order("start_time")
    .order("sort_order");

  const t = await getTranslations("Schedule");
  const items = (data as ScheduleItem[] | null) ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-bold text-slate-900">{t("pageTitle")}</h1>
      {items.length === 0 ? (
        <p className="mt-6 text-slate-500">{t("comingSoon")}</p>
      ) : (
        <ScheduleView items={items} />
      )}
    </div>
  );
}
