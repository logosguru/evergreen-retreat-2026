import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ScheduleManager } from "@/components/ScheduleManager";
import type { ScheduleItem } from "@/lib/types";

export default async function AdminSchedulePage({
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

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">{t("manageTitle")}</h1>
      <ScheduleManager items={(data as ScheduleItem[] | null) ?? []} />
    </div>
  );
}
