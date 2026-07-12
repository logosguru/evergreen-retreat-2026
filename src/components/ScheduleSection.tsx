import { useTranslations } from "next-intl";
import { ScheduleView } from "@/components/ScheduleView";
import { Reveal } from "./Reveal";
import type { ScheduleItem } from "@/lib/types";

export function ScheduleSection({ items }: { items: ScheduleItem[] }) {
  const t = useTranslations("Schedule");

  return (
    <section id="schedule" className="scroll-mt-20 bg-background">
      <div className="mx-auto max-w-4xl px-6 py-24 sm:px-8">
        <Reveal>
          <p className="eyebrow text-gold">Program</p>
          <h2 className="font-display-ko mt-3 text-4xl font-bold text-pine sm:text-5xl">
            {t("pageTitle")}
          </h2>
          <div className="mt-5 h-px w-16 bg-gold" />
        </Reveal>

        {items.length === 0 ? (
          <Reveal>
            <p className="mt-10 rounded-2xl bg-white/60 px-6 py-10 text-center text-bark-soft ring-1 ring-line">
              {t("comingSoon")}
            </p>
          </Reveal>
        ) : (
          <Reveal delay={80}>
            <ScheduleView items={items} />
            <p className="mt-6 text-xs text-bark-soft/70">{t("subjectToChange")}</p>
          </Reveal>
        )}
      </div>
    </section>
  );
}
