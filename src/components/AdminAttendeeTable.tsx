"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { setPaid, setLanguage } from "@/app/[locale]/admin/actions";
import { LANGUAGES, type Language } from "@/lib/types";
import {
  personFee,
  formatUSD,
  type AttendeeWithRoom,
  type Household,
} from "@/lib/fees";

export function AdminAttendeeTable({ households }: { households: Household[] }) {
  const t = useTranslations("Admin");
  const tr = useTranslations("Role");
  const tf = useTranslations("Fee");
  const trm = useTranslations("Rooms");
  const tl = useTranslations("Language");
  const router = useRouter();
  const [, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function togglePaid(headId: string, current: boolean) {
    setBusy(headId);
    start(async () => {
      await setPaid(headId, !current);
      setBusy(null);
      router.refresh();
    });
  }

  function changeLang(id: string, language: Language) {
    start(async () => {
      await setLanguage(id, language);
      router.refresh();
    });
  }

  function feeText(a: AttendeeWithRoom) {
    const f = personFee(a);
    if (a.is_under_6) return tf("exempt");
    if (f == null) return tf("pending");
    return formatUSD(f);
  }

  if (households.length === 0) {
    return (
      <p className="rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-600">
        {t("empty")}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {households.map((h) => {
        const people: AttendeeWithRoom[] = [h.head, ...h.members];
        return (
          <div
            key={h.head.id}
            className="overflow-hidden rounded-xl ring-1 ring-slate-200"
          >
            <div className="flex items-center justify-between bg-slate-50 px-4 py-2">
              <div className="text-sm font-medium text-slate-700">
                {h.head.korean_name} {t("householder")} ·{" "}
                {formatUSD(h.total)}
                {h.unassignedCount > 0 && (
                  <span className="ml-2 text-xs text-amber-600">
                    {tf("unassignedNotice", { count: h.unassignedCount })}
                  </span>
                )}
              </div>
              <button
                disabled={busy === h.head.id}
                onClick={() => togglePaid(h.head.id, h.head.paid)}
                className={
                  h.head.paid
                    ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-200 disabled:opacity-60"
                    : "rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-300 disabled:opacity-60"
                }
              >
                {h.head.paid ? tf("paid") : tf("unpaid")}
              </button>
            </div>
            <table className="min-w-full divide-y divide-slate-100 bg-white text-sm">
              <tbody className="divide-y divide-slate-100">
                {people.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2">
                      <span className="font-medium text-slate-900">
                        {a.korean_name}
                      </span>
                      {a.is_under_6 && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                          {t("under6")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {a.role ? tr(a.role) : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={a.language}
                        onChange={(e) =>
                          changeLang(a.id, e.target.value as Language)
                        }
                        className="rounded-md border border-slate-300 px-1.5 py-1 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        {LANGUAGES.map((l) => (
                          <option key={l} value={l}>
                            {tl(l)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {a.rooms?.label ?? trm("unassigned")}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-700">
                      {feeText(a)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
