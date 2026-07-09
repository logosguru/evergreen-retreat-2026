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
    <div className="mt-8 space-y-10">
      {groups.map((g) => (
        <section key={g.day}>
          <h2 className="mb-3 border-b border-emerald-100 pb-1 text-xl font-semibold text-emerald-800">
            {formatDayLabel(g.day, locale)}
          </h2>
          <ul className="space-y-3">
            {g.items.map((it) => {
              const location = localized(it, "location", locale);
              const description = localized(it, "description", locale);
              return (
                <li
                  key={it.id}
                  className={
                    it.by_language
                      ? "flex gap-4 border-l-2 border-indigo-300 pl-3"
                      : "flex gap-4"
                  }
                >
                  <span className="w-14 shrink-0 font-mono text-sm text-emerald-700">
                    {formatTime(it.start_time)}
                  </span>
                  <div>
                    <p className="font-medium text-slate-800">
                      {localized(it, "title", locale)}
                      {it.by_language && (
                        <span className="ml-2 inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                          {t("byLanguageBadge")}
                        </span>
                      )}
                      {location && (
                        <span className="ml-2 text-sm font-normal text-slate-400">
                          @{location}
                        </span>
                      )}
                    </p>
                    {description && (
                      <p className="text-sm text-slate-500">{description}</p>
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
