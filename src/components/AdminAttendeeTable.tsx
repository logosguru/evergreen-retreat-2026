"use client";

import {
  Fragment,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { setLanguage } from "@/app/[locale]/admin/actions";
import { LANGUAGES, type Language } from "@/lib/types";
import {
  personFee,
  formatUSD,
  groupHouseholds,
  householdBalance,
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

const VIEW_STORAGE_KEY = "admin-attendee-view";

// localStorage의 저장된 보기 모드를 hydration 안전하게 구독 (SSR에선 null).
function subscribeStorage(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}
function useStoredView(): "list" | "grouped" | null {
  const v = useSyncExternalStore(
    subscribeStorage,
    () => window.localStorage.getItem(VIEW_STORAGE_KEY),
    () => null,
  );
  return v === "list" || v === "grouped" ? v : null;
}

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
  paidByHead,
}: {
  attendees: AttendeeWithRoom[];
  paidByHead: Record<string, number>;
}) {
  const t = useTranslations("Admin");
  const tr = useTranslations("Role");
  const td = useTranslations("District");
  const ta = useTranslations("Attendance");
  const tf = useTranslations("Fee");
  const trm = useTranslations("Rooms");
  const tl = useTranslations("Language");
  const tp = useTranslations("Pickup");
  const locale = useLocale();
  const dateFmt = new Intl.DateTimeFormat(
    locale === "en" ? "en-US" : locale === "es" ? "es-ES" : "ko-KR",
    { year: "numeric", month: "short", day: "numeric" },
  );
  const router = useRouter();
  const [, start] = useTransition();
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  // 보기 모드: 기본 가구별. 마지막 선택을 localStorage에 보존해
  // 편집 페이지에서 돌아와도(어떤 경로든) 이전 보기로 복원된다.
  // 세션 내 전환은 override(state), 초기값은 저장소 구독 — SSR은 기본값.
  const storedView = useStoredView();
  const [viewOverride, setViewOverride] = useState<"list" | "grouped" | null>(
    null,
  );
  const view = viewOverride ?? storedView ?? "grouped";
  function changeView(v: "list" | "grouped") {
    setViewOverride(v);
    window.localStorage.setItem(VIEW_STORAGE_KEY, v);
  }

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

  function feeText(a: AttendeeWithRoom) {
    const f = personFee(a);
    if (a.is_under_6) return tf("exempt");
    if (f == null) return tf("pending");
    return formatUSD(f);
  }

  const totalByHead = new Map(
    groupHouseholds(attendees).map((h) => [h.head.id, h.total]),
  );

  function balanceBadge(headId: string) {
    const total = totalByHead.get(headId) ?? 0;
    const paid = paidByHead[headId] ?? 0;
    const bal = householdBalance(total, paid);
    // 회비 total=0(객실 타입 미선택 등)이면 아직 낼 금액이 정해지지 않은 상태 →
    // '정산 완료'가 아니라 중립 '회비 미산정'으로 표시(오해 방지). 납입액이 있으면
    // 예외적으로 잔액에 따라 처리(초과=환불).
    const noFee = total === 0 && paid === 0;
    const cls = noFee
      ? "bg-slate-100 text-slate-500"
      : bal > 0
        ? "bg-amber-100 text-amber-800"
        : bal < 0
          ? "bg-rose-100 text-rose-700"
          : "bg-emerald-100 text-emerald-700";
    const label = noFee
      ? t("balanceNoFee")
      : bal > 0
        ? t("balanceOwe", { amount: formatUSD(bal) })
        : bal < 0
          ? t("balanceRefund", { amount: formatUSD(-bal) })
          : t("balanceSettled");
    return (
      <Link
        href={`/admin/attendees/${headId}/payments`}
        className={`inline-block rounded-full px-3 py-1 text-xs font-medium hover:brightness-95 ${cls}`}
      >
        {label}
      </Link>
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

  // 두 보기가 공유하는 셀: 직분/구역/참석/방/언어(+회비, 리스트 보기는 잔액 배지로 대체하므로 생략 가능)
  function personCells(a: AttendeeWithRoom, opts?: { fee?: boolean }) {
    const showFee = opts?.fee ?? true;
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
        <td className="px-3 py-2 text-slate-600">
          {a.pickup_location ? tp(a.pickup_location) : "—"}
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
        {showFee && (
          <td className="px-3 py-2 text-right text-slate-700">{feeText(a)}</td>
        )}
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
      <button type="button" onClick={() => changeView("grouped")} className={viewBtn(view === "grouped")}>
        {t("viewGrouped")}
      </button>
      <button type="button" onClick={() => changeView("list")} className={viewBtn(view === "list")}>
        {t("viewList")}
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
                <th className="px-3 py-2 text-left font-medium">{t("colPickup")}</th>
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
                      <td colSpan={8} className="px-3 py-2">
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
                          {balanceBadge(h.head.id)}
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
              <th className="px-3 py-2 text-left font-medium">
                {t("colPickup")}
              </th>
              <SortTh
                k="language"
                label={t("colLanguage")}
                sort={sort}
                onToggle={toggleSort}
              />
              <th className="px-3 py-2 text-left font-medium">
                {t("colBalance")}
              </th>
              <SortTh
                k="registered"
                label={t("colRegistered")}
                sort={sort}
                onToggle={toggleSort}
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((a) => {
              const head = headOf(a, heads);
              const headId = head?.id ?? a.id;
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
                  {personCells(a, { fee: false })}
                  <td className="px-3 py-2">
                    {a.is_householder ? balanceBadge(headId) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                    {dateFmt.format(new Date(a.created_at))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
