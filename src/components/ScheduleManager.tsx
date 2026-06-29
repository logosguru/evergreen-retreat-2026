"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { ScheduleItem } from "@/lib/types";
import { groupByDay, formatDayLabel, formatTime } from "@/lib/schedule";
import {
  upsertScheduleItem,
  deleteScheduleItem,
} from "@/app/[locale]/admin/schedule-actions";

const input =
  "rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

// 수련회 3일 (고정)
const RETREAT_DAYS = ["2026-09-05", "2026-09-06", "2026-09-07"];

export function ScheduleManager({ items }: { items: ScheduleItem[] }) {
  const t = useTranslations("Schedule");
  const locale = useLocale();
  const router = useRouter();
  const [, start] = useTransition();

  const [editId, setEditId] = useState<string | null>(null);
  const [day, setDay] = useState(RETREAT_DAYS[0]);
  const [time, setTime] = useState("09:00");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [loc, setLoc] = useState("");

  function reset() {
    setEditId(null);
    setDay(RETREAT_DAYS[0]);
    setTime("09:00");
    setTitle("");
    setDesc("");
    setLoc("");
  }

  function submit() {
    if (!title.trim()) return;
    start(async () => {
      await upsertScheduleItem({
        id: editId ?? undefined,
        day,
        start_time: time,
        title,
        description: desc,
        location: loc,
      });
      reset();
      router.refresh();
    });
  }

  function editItem(it: ScheduleItem) {
    setEditId(it.id);
    setDay(it.day);
    setTime(formatTime(it.start_time));
    setTitle(it.title);
    setDesc(it.description ?? "");
    setLoc(it.location ?? "");
  }

  const groups = groupByDay(items);

  return (
    <div className="space-y-8">
      {groups.length === 0 && (
        <p className="text-sm text-slate-500">{t("empty")}</p>
      )}
      {groups.map((g) => (
        <section key={g.day}>
          <h2 className="mb-2 text-lg font-semibold text-slate-900">
            {formatDayLabel(g.day, locale)}
          </h2>
          <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
            {g.items.map((it) => (
              <li
                key={it.id}
                className="flex items-start justify-between gap-3 px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium text-slate-800">
                    {formatTime(it.start_time)} · {it.title}
                  </span>
                  {it.location && (
                    <span className="text-slate-400"> @{it.location}</span>
                  )}
                  {it.description && (
                    <p className="text-slate-500">{it.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => editItem(it)}
                    className="text-emerald-700 hover:text-emerald-800"
                  >
                    {t("edit")}
                  </button>
                  <button
                    onClick={() =>
                      start(async () => {
                        await deleteScheduleItem(it.id);
                        router.refresh();
                      })
                    }
                    className="text-rose-600 hover:text-rose-700"
                  >
                    {t("delete")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="rounded-lg p-4 ring-1 ring-slate-200">
        <h2 className="mb-3 text-base font-semibold text-slate-900">
          {editId ? t("editItem") : t("addItem")}
        </h2>
        <div className="flex flex-wrap items-end gap-2">
          <select
            className={input}
            value={day}
            onChange={(e) => setDay(e.target.value)}
          >
            {RETREAT_DAYS.map((d) => (
              <option key={d} value={d}>
                {formatDayLabel(d, locale)}
              </option>
            ))}
          </select>
          <input
            className={`${input} w-24`}
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
          <input
            className={input}
            placeholder={t("titleField")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className={input}
            placeholder={t("locationField")}
            value={loc}
            onChange={(e) => setLoc(e.target.value)}
          />
          <input
            className={`${input} flex-1`}
            placeholder={t("descField")}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          <button
            onClick={submit}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            {editId ? t("save") : t("add")}
          </button>
          {editId && (
            <button
              onClick={reset}
              className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700"
            >
              {t("cancel")}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
