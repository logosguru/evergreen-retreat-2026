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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-2xl font-bold text-slate-900">{t("manageTitle")}</h1>
        <div className="flex items-center gap-2">
          {/* 장소 벽에 붙일 대형 이중언어 포스터 (새 탭 — 인쇄 전용 화면) */}
          <a
            href="/schedule/poster"
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {t("posterLink")}
          </a>
          <PrintScheduleButton />
        </div>
      </div>
      <div className="print:hidden">
        <ScheduleManager items={items} />
      </div>
      <SchedulePrintable items={items} />
    </div>
  );
}
