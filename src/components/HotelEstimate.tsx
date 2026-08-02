"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  ASSUMED_CAPACITIES,
  type AssumedCapacity,
  type EstimateBucket,
  type HotelEstimate,
} from "@/lib/hotel-estimate";

// 서버가 2/3/4인실 세 시나리오를 미리 계산해 넘긴다(PII를 클라이언트로 보내지 않기 위해).
export function HotelEstimateSection({
  estimates,
}: {
  estimates: HotelEstimate[];
}) {
  const t = useTranslations("HotelEstimate");
  const [assumed, setAssumed] = useState<AssumedCapacity>(4);
  const est =
    estimates.find((e) => e.assumedCapacity === assumed) ?? estimates[0];

  if (!est) return null;

  const rows: { label: string; bucket: EstimateBucket }[] = [
    ...est.decided.map((bucket) => ({
      label: t("decidedRow", {
        room: t("capacityRoom", { n: bucket.capacity }),
      }),
      bucket,
    })),
    ...(est.assumed
      ? [
          {
            label: t("assumedRow", {
              room: t("capacityRoom", { n: est.assumed.capacity }),
            }),
            bucket: est.assumed,
          },
        ]
      : []),
  ];

  const notes: string[] = [];
  if (est.unlinkedAttendees > 0)
    notes.push(t("noteUnlinked", { count: est.unlinkedAttendees }));
  if (est.under6 > 0) notes.push(t("noteUnder6", { count: est.under6 }));
  if (est.partialCount > 0)
    notes.push(t("notePartial", { count: est.partialCount }));
  if (est.unknownGenderHouseholds > 0)
    notes.push(t("noteUnknownGender", { count: est.unknownGenderHouseholds }));
  if (est.zeroOccupancyHouseholds > 0)
    notes.push(t("noteZeroOccupancy", { count: est.zeroOccupancyHouseholds }));

  return (
    <section className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t("title")}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{t("subtitle")}</p>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">
            {t("assumptionLabel")}
          </span>
          <div className="flex gap-1">
            {ASSUMED_CAPACITIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setAssumed(c)}
                aria-pressed={c === assumed}
                className={
                  c === assumed
                    ? "rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white"
                    : "rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200"
                }
              >
                {t("capacityRoom", { n: c })}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-4 text-3xl font-bold text-slate-900">
        {t("totalRooms", { count: est.totalRooms })}
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[28rem] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3 font-medium">{t("colType")}</th>
              <th className="py-2 pr-3 text-right font-medium">
                {t("colHouseholds")}
              </th>
              <th className="py-2 pr-3 text-right font-medium">
                {t("colPeople")}
              </th>
              <th className="py-2 text-right font-medium">{t("colRooms")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="py-2 pr-3">
                  <span className="text-slate-800">{r.label}</span>
                  <span className="block text-xs text-slate-400">
                    {t("roomBreakdown", {
                      family: r.bucket.familyRooms,
                      shared: r.bucket.sharedRooms,
                    })}
                  </span>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-slate-600">
                  {t("households", { count: r.bucket.households })}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-slate-600">
                  {t("people", { count: r.bucket.people })}
                </td>
                <td className="py-2 text-right font-semibold tabular-nums text-slate-900">
                  {r.bucket.rooms}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 font-semibold text-slate-900">
              <td className="py-2 pr-3">{t("totalRow")}</td>
              <td className="py-2 pr-3 text-right tabular-nums">—</td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {t("people", { count: est.totalPeople })}
              </td>
              <td className="py-2 text-right tabular-nums">{est.totalRooms}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-3 text-xs text-slate-500">{t("rule")}</p>
      {notes.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-slate-500">
          {notes.map((n) => (
            <li key={n}>· {n}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
