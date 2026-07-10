"use client";

import { useLocale, useTranslations } from "next-intl";
import type { ScheduleItem } from "@/lib/types";
import { groupByDay, formatDayLabel, formatTime } from "@/lib/schedule";
import { localized } from "@/lib/localized";

export function ScheduleView({ items }: { items: ScheduleItem[] }) {
  const locale = useLocale();
  const t = useTranslations("Schedule");
  const groups = groupByDay(items);

  return (
    <div className="mt-12 space-y-12">
      {groups.map((g) => (
        <section key={g.day}>
          <h3 className="font-display-ko flex items-baseline gap-3 text-2xl font-bold text-pine">
            <span className="text-gold">✦</span>
            {formatDayLabel(g.day, locale)}
          </h3>
          <ul className="mt-5 space-y-1 border-l border-line pl-4">
            {g.items.map((it) => {
              const location = localized(it, "location", locale);
              const description = localized(it, "description", locale);
              return (
                <li
                  key={it.id}
                  className={`flex gap-4 rounded-lg px-3 py-2.5 transition hover:bg-white/70 ${
                    it.by_language ? "border-l-2 border-moss" : ""
                  }`}
                >
                  <span className="w-14 shrink-0 pt-0.5 text-sm font-semibold tabular-nums text-moss">
                    {formatTime(it.start_time)}
                  </span>
                  <div>
                    <p className="font-medium text-bark">
                      {localized(it, "title", locale)}
                      {it.by_language && (
                        <span className="ml-2 inline-flex rounded-full bg-moss/15 px-2 py-0.5 text-xs font-medium text-moss">
                          {t("byLanguageBadge")}
                        </span>
                      )}
                      {location && (
                        <span className="ml-2 text-sm font-normal text-bark-soft/70">
                          @{location}
                        </span>
                      )}
                    </p>
                    {description && (
                      <p className="mt-0.5 text-sm text-bark-soft">{description}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
