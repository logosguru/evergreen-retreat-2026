"use client";

import { Fragment, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { setPaid, setLanguage } from "@/app/[locale]/admin/actions";
import { LANGUAGES, type Language } from "@/lib/types";
import {
  personFee,
  formatUSD,
  groupHouseholds,
  type AttendeeWithRoom,
} from "@/lib/fees";
import { displayName, nameKey } from "@/lib/names";
import {
  sortAttendees,
  buildHeads,
  headOf,
  type SortKey,
  type SortState,
} from "@/lib/attendee-sort";

function SortTh({
  k,
  label,
  sort,
  onToggle,
}: {
  k: SortKey;
  label: string;
  sort: SortState;
  onToggle: (key: SortKey) => void;
}) {
  const arrow = sort.key === k ? (sort.dir === "asc" ? " ▲" : " ▼") : "";
  return (
    <th className="px-3 py-2 text-left font-medium">
      <button
        type="button"
        onClick={() => onToggle(k)}
        className="inline-flex items-center gap-0.5 hover:text-slate-900"
      >
        {label}
        <span className="text-emerald-600">{arrow}</span>
      </button>
    </th>
  );
}

export function AdminAttendeeTable({
  attendees,
}: {
  attendees: AttendeeWithRoom[];
}) {
  const t = useTranslations("Admin");
  const tr = useTranslations("Role");
  const td = useTranslations("District");
  const ta = useTranslations("Attendance");
  const tf = useTranslations("Fee");
  const trm = useTranslations("Rooms");
  const tl = useTranslations("Language");
  const router = useRouter();
  const [, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  const [view, setView] = useState<"list" | "grouped">("list");

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  }

  function changeLang(id: string, language: Language) {
    start(async () => {
      await setLanguage(id, language);
      router.refresh();
    });
  }

  function togglePaid(headId: string, current: boolean) {
    setBusy(headId);
    start(async () => {
      await setPaid(headId, !current);
      setBusy(null);
      router.refresh();
    });
  }

  function feeText(a: AttendeeWithRoom) {
    const f = personFee(a);
    if (a.is_under_6) return tf("exempt");
    if (f == null) return tf("pending");
    return formatUSD(f);
  }

  function paidButton(headId: string, headPaid: boolean) {
    return (
      <button
        type="button"
        disabled={busy === headId}
        onClick={() => togglePaid(headId, headPaid)}
        className={
          headPaid
            ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-200 disabled:opacity-60"
            : "rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-300 disabled:opacity-60"
        }
      >
        {headPaid ? tf("paid") : tf("unpaid")}
      </button>
    );
  }

  function nameLink(a: AttendeeWithRoom) {
    return (
      <>
        <Link
          href={`/admin/attendees/${a.id}/edit`}
          className="font-medium text-emerald-700 hover:underline"
        >
          {displayName(a)}
        </Link>
        {a.is_under_6 && (
          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
            {t("under6")}
          </span>
        )}
      </>
    );
  }

  // 두 보기가 공유하는 셀: 직분/구역/참석/방/언어/회비
  function personCells(a: AttendeeWithRoom) {
    return (
      <>
        <td className="px-3 py-2 text-slate-600">
          {a.role ? tr(a.role) : "—"}
        </td>
        <td className="px-3 py-2 text-slate-600">
          {a.district ? td(a.district) : "—"}
        </td>
        <td className="px-3 py-2">
          <span
            className={
              a.attendance === "partial"
                ? "rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-700"
                : "rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600"
            }
          >
            {ta(a.attendance)}
          </span>
        </td>
        <td className="px-3 py-2 text-slate-600">
          {a.rooms?.label ?? trm("unassigned")}
        </td>
        <td className="px-3 py-2">
          <select
            value={a.language}
            onChange={(e) => changeLang(a.id, e.target.value as Language)}
            className="rounded-md border border-slate-300 px-1.5 py-1 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {tl(l)}
              </option>
            ))}
          </select>
        </td>
        <td className="px-3 py-2 text-right text-slate-700">{feeText(a)}</td>
      </>
    );
  }

  if (attendees.length === 0) {
    return (
      <p className="rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-600">
        {t("empty")}
      </p>
    );
  }

  const viewBtn = (active: boolean) =>
    active
      ? "bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
      : "bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50";

  const toggle = (
    <div className="mb-3 inline-flex overflow-hidden rounded-lg ring-1 ring-slate-300">
      <button type="button" onClick={() => setView("list")} className={viewBtn(view === "list")}>
        {t("viewList")}
      </button>
      <button type="button" onClick={() => setView("grouped")} className={viewBtn(view === "grouped")}>
        {t("viewGrouped")}
      </button>
    </div>
  );

  // ── 가구별 보기 ──
  if (view === "grouped") {
    const households = groupHouseholds(attendees).sort((x, y) =>
      nameKey(x.head).localeCompare(nameKey(y.head)),
    );
    return (
      <div>
        {toggle}
        <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
          <table className="min-w-full divide-y divide-slate-100 bg-white text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t("colName")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("colRole")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("colDistrict")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("colAttendance")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("colRoom")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("colLanguage")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("colPaid")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {households.map((h) => {
                const people = [
                  h.head,
                  ...[...h.members].sort((a, b) =>
                    a.created_at.localeCompare(b.created_at),
                  ),
                ];
                return (
                  <Fragment key={h.head.id}>
                    <tr className="bg-slate-50">
                      <td colSpan={7} className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-semibold text-slate-900">
                            {t("groupHeader", {
                              name: displayName(h.head),
                              count: people.length,
                            })}
                          </span>
                          <span className="text-slate-600">
                            {formatUSD(h.total)}
                          </span>
                          {h.unassignedCount > 0 && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                              {t("groupPending", { count: h.unassignedCount })}
                            </span>
                          )}
                          <span className="flex-1" />
                          {paidButton(h.head.id, h.head.paid)}
                        </div>
                      </td>
                    </tr>
                    {people.map((a) => (
                      <tr key={a.id}>
                        <td className="px-3 py-2 pl-8">
                          {nameLink(a)}
                          {a.is_householder && (
                            <span className="ml-1 text-xs text-slate-400">
                              ({t("householder")})
                            </span>
                          )}
                        </td>
                        {personCells(a)}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ── 리스트 보기 (기본) ──
  const heads = buildHeads(attendees);
  const rows = sortAttendees(attendees, sort);

  return (
    <div>
      {toggle}
      <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
        <table className="min-w-full divide-y divide-slate-100 bg-white text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{t("colName")}</th>
              <SortTh
                k="household"
                label={t("colHousehold")}
                sort={sort}
                onToggle={toggleSort}
              />
              <th className="px-3 py-2 text-left font-medium">{t("colRole")}</th>
              <th className="px-3 py-2 text-left font-medium">
                {t("colDistrict")}
              </th>
              <SortTh
                k="attendance"
                label={t("colAttendance")}
                sort={sort}
                onToggle={toggleSort}
              />
              <SortTh
                k="room"
                label={t("colRoom")}
                sort={sort}
                onToggle={toggleSort}
              />
              <SortTh
                k="language"
                label={t("colLanguage")}
                sort={sort}
                onToggle={toggleSort}
              />
              <th className="px-3 py-2 text-right font-medium">{t("colPaid")}</th>
              <th className="px-3 py-2 text-left font-medium">
                {t("colPayment")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((a) => {
              const head = headOf(a, heads);
              const headId = head?.id ?? a.id;
              const headPaid = head?.paid ?? a.paid;
              return (
                <tr key={a.id}>
                  <td className="px-3 py-2">{nameLink(a)}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {displayName(head ?? a)}
                    {a.is_householder && (
                      <span className="ml-1 text-xs text-slate-400">
                        ({t("householder")})
                      </span>
                    )}
                  </td>
                  {personCells(a)}
                  <td className="px-3 py-2">{paidButton(headId, headPaid)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
