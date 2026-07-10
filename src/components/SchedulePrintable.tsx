"use client";

import { useLocale, useTranslations } from "next-intl";
import type { ScheduleItem } from "@/lib/types";
import { groupByDay, formatDayLabel, formatTime } from "@/lib/schedule";
import { localized } from "@/lib/localized";

// 인쇄(PDF) 전용 일정표: 화면에선 숨김(hidden), 인쇄 시에만 표시(print:block).
// 공개 화면과 달리 담당자/비고 열까지 포함한다.
export function SchedulePrintable({ items }: { items: ScheduleItem[] }) {
  const locale = useLocale();
  const t = useTranslations("Schedule");
  const groups = groupByDay(items);

  return (
    <div className="hidden print:block">
      <h1 className="mb-4 text-xl font-bold text-black">{t("printTitle")}</h1>
      {groups.map((g) => (
        <section key={g.day} className="mb-6 break-inside-avoid">
          <h2 className="mb-1.5 border-b border-black pb-1 text-base font-bold text-black">
            {formatDayLabel(g.day, locale)}
          </h2>
          <table className="w-full border-collapse text-[11px] text-black">
            <thead>
              <tr className="text-left">
                <th className="border border-slate-400 px-1.5 py-1 font-semibold">
                  {t("colTime")}
                </th>
                <th className="border border-slate-400 px-1.5 py-1 font-semibold">
                  {t("titleField")}
                </th>
                <th className="border border-slate-400 px-1.5 py-1 font-semibold">
                  {t("colLocation")}
                </th>
                <th className="border border-slate-400 px-1.5 py-1 font-semibold">
                  {t("ownerField")}
                </th>
                <th className="border border-slate-400 px-1.5 py-1 font-semibold">
                  {t("noteField")}
                </th>
              </tr>
            </thead>
            <tbody>
              {g.items.map((it) => (
                <tr key={it.id} className="break-inside-avoid align-top">
                  <td className="whitespace-nowrap border border-slate-400 px-1.5 py-1 tabular-nums">
                    {formatTime(it.start_time)}
                  </td>
                  <td className="border border-slate-400 px-1.5 py-1">
                    {localized(it, "title", locale)}
                    {it.by_language && ` (${t("byLanguageBadge")})`}
                    {(() => {
                      const d = localized(it, "description", locale);
                      return d ? (
                        <span className="block text-slate-600">{d}</span>
                      ) : null;
                    })()}
                  </td>
                  <td className="border border-slate-400 px-1.5 py-1">
                    {localized(it, "location", locale) ?? ""}
                  </td>
                  <td className="border border-slate-400 px-1.5 py-1">
                    {it.owner ?? ""}
                  </td>
                  <td className="border border-slate-400 px-1.5 py-1">
                    {it.admin_note ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
