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

// 언어 행 라벨은 원어 고정 표기 (번역 안 함)
const LANGS = [
  { suffix: "", label: "한국어" },
  { suffix: "_en", label: "English" },
  { suffix: "_es", label: "Español" },
] as const;

type Suffix = (typeof LANGS)[number]["suffix"];
type TextKey = `${"title" | "location" | "description"}${Suffix}`;
type TextFields = Record<TextKey, string>;

const EMPTY: TextFields = {
  title: "",
  title_en: "",
  title_es: "",
  location: "",
  location_en: "",
  location_es: "",
  description: "",
  description_en: "",
  description_es: "",
};

export function ScheduleManager({ items }: { items: ScheduleItem[] }) {
  const t = useTranslations("Schedule");
  const locale = useLocale();
  const router = useRouter();
  const [, start] = useTransition();

  const [editId, setEditId] = useState<string | null>(null);
  const [day, setDay] = useState(RETREAT_DAYS[0]);
  const [time, setTime] = useState("09:00");
  const [fields, setFields] = useState<TextFields>(EMPTY);

  const set = (k: TextKey) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }));

  function reset() {
    setEditId(null);
    setDay(RETREAT_DAYS[0]);
    setTime("09:00");
    setFields(EMPTY);
  }

  function submit() {
    if (!fields.title.trim()) return;
    start(async () => {
      await upsertScheduleItem({
        id: editId ?? undefined,
        day,
        start_time: time,
        ...fields,
      });
      reset();
      router.refresh();
    });
  }

  function editItem(it: ScheduleItem) {
    setEditId(it.id);
    setDay(it.day);
    setTime(formatTime(it.start_time));
    setFields({
      title: it.title,
      title_en: it.title_en ?? "",
      title_es: it.title_es ?? "",
      location: it.location ?? "",
      location_en: it.location_en ?? "",
      location_es: it.location_es ?? "",
      description: it.description ?? "",
      description_en: it.description_en ?? "",
      description_es: it.description_es ?? "",
    });
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
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
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
          </div>
          {LANGS.map(({ suffix, label }) => (
            <div
              key={label}
              className="grid gap-2 sm:grid-cols-[4.5rem_1fr_1fr_1.5fr] sm:items-center"
            >
              <span className="text-xs font-medium text-slate-500">
                {label}
              </span>
              <input
                className={input}
                placeholder={t("titleField")}
                value={fields[`title${suffix}`]}
                onChange={set(`title${suffix}`)}
              />
              <input
                className={input}
                placeholder={t("locationField")}
                value={fields[`location${suffix}`]}
                onChange={set(`location${suffix}`)}
              />
              <input
                className={input}
                placeholder={t("descField")}
                value={fields[`description${suffix}`]}
                onChange={set(`description${suffix}`)}
              />
            </div>
          ))}
          <div className="flex gap-2">
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
        </div>
      </section>
    </div>
  );
}
