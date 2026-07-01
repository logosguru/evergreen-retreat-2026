import { useTranslations } from "next-intl";
import { ScheduleView } from "@/components/ScheduleView";
import type { ScheduleItem } from "@/lib/types";

export function ScheduleSection({ items }: { items: ScheduleItem[] }) {
  const t = useTranslations("Schedule");

  return (
    <section id="schedule" className="mx-auto max-w-2xl scroll-mt-8 px-4 py-12">
      <h2 className="text-3xl font-bold text-slate-900">{t("pageTitle")}</h2>
      {items.length === 0 ? (
        <p className="mt-6 text-slate-500">{t("comingSoon")}</p>
      ) : (
        <ScheduleView items={items} />
      )}
    </section>
  );
}
