import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ScheduleManager } from "@/components/ScheduleManager";
import { SchedulePrintable } from "@/components/SchedulePrintable";
import { PrintScheduleButton } from "@/components/PrintScheduleButton";
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
  const items = (data as ScheduleItem[] | null) ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <h1 className="text-2xl font-bold text-slate-900">{t("manageTitle")}</h1>
        <PrintScheduleButton />
      </div>
      <div className="print:hidden">
        <ScheduleManager items={items} />
      </div>
      <SchedulePrintable items={items} />
    </div>
  );
}
