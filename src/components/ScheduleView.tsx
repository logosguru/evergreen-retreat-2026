"use client";

import { useLocale } from "next-intl";
import type { ScheduleItem } from "@/lib/types";
import { groupByDay, formatDayLabel, formatTime } from "@/lib/schedule";

export function ScheduleView({ items }: { items: ScheduleItem[] }) {
  const locale = useLocale();
  const groups = groupByDay(items);

  return (
    <div className="mt-8 space-y-10">
      {groups.map((g) => (
        <section key={g.day}>
          <h2 className="mb-3 border-b border-emerald-100 pb-1 text-xl font-semibold text-emerald-800">
            {formatDayLabel(g.day, locale)}
          </h2>
          <ul className="space-y-3">
            {g.items.map((it) => (
              <li key={it.id} className="flex gap-4">
                <span className="w-14 shrink-0 font-mono text-sm text-emerald-700">
                  {formatTime(it.start_time)}
                </span>
                <div>
                  <p className="font-medium text-slate-800">
                    {it.title}
                    {it.location && (
                      <span className="ml-2 text-sm font-normal text-slate-400">
                        @{it.location}
                      </span>
                    )}
                  </p>
                  {it.description && (
                    <p className="text-sm text-slate-500">{it.description}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
