"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { setPaid } from "@/app/[locale]/admin/actions";
import type { Attendee } from "@/lib/types";

export function AdminAttendeeTable({ attendees }: { attendees: Attendee[] }) {
  const t = useTranslations("Admin");
  const tr = useTranslations("Role");
  const tg = useTranslations("Gender");
  const ta = useTranslations("Attendance");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function togglePaid(a: Attendee) {
    setBusyId(a.id);
    start(async () => {
      await setPaid(a.id, !a.paid);
      setBusyId(null);
      router.refresh();
    });
  }

  if (attendees.length === 0) {
    return (
      <p className="rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-600">
        {t("empty")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
      <table className="min-w-full divide-y divide-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2.5">{t("colName")}</th>
            <th className="px-3 py-2.5">{t("colDistrict")}</th>
            <th className="px-3 py-2.5">{t("colRole")}</th>
            <th className="px-3 py-2.5">{t("colGender")}</th>
            <th className="px-3 py-2.5">{t("colAttendance")}</th>
            <th className="px-3 py-2.5">{t("colHousehold")}</th>
            <th className="px-3 py-2.5">{t("colPaid")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {attendees.map((a) => (
            <tr key={a.id} className="hover:bg-slate-50">
              <td className="px-3 py-2.5">
                <div className="font-medium text-slate-900">
                  {a.korean_name}
                </div>
                {a.english_name && (
                  <div className="text-xs text-slate-500">{a.english_name}</div>
                )}
              </td>
              <td className="px-3 py-2.5 text-slate-600">{a.district ?? "—"}</td>
              <td className="px-3 py-2.5 text-slate-600">
                {a.role ? tr(a.role) : "—"}
              </td>
              <td className="px-3 py-2.5 text-slate-600">
                {a.gender ? tg(a.gender) : "—"}
              </td>
              <td className="px-3 py-2.5 text-slate-600">
                {ta(a.attendance)}
                {a.attendance === "partial" && a.arrival_at && (
                  <div className="text-xs text-slate-400">
                    {a.arrival_at.slice(0, 16).replace("T", " ")}
                  </div>
                )}
              </td>
              <td className="px-3 py-2.5 text-slate-600">
                {a.is_householder ? t("householder") : "·"}
              </td>
              <td className="px-3 py-2.5">
                <button
                  type="button"
                  disabled={pending && busyId === a.id}
                  onClick={() => togglePaid(a)}
                  className={
                    a.paid
                      ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-200 disabled:opacity-60"
                      : "rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500 hover:bg-slate-200 disabled:opacity-60"
                  }
                >
                  {a.paid ? t("markUnpaid") : t("markPaid")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
