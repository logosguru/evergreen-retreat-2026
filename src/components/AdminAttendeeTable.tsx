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
import { setLanguage } from "@/app/[locale]/(site)/admin/actions";
import { LANGUAGES, type Language } from "@/lib/types";
import {
  personFee,
  personBaseFee,
  hasFeeDiscount,
  formatUSD,
  groupHouseholds,
  householdBalance,
  householdOccupancy,
  type AttendeeWithRoom,
} from "@/lib/fees";
import { displayName } from "@/lib/names";
import {
  sortAttendees,
  sortHouseholds,
  buildHeads,
  headOf,
  SORT_KEYS,
  type SortKey,
  type SortState,
} from "@/lib/attendee-sort";

const VIEW_STORAGE_KEY = "admin-attendee-view";
const SORT_STORAGE_KEY = "admin-attendee-sort";
// 기본 정렬: 등록일 최신순 (최근 등록자가 위로)
const DEFAULT_SORT: SortState = { key: "registered", dir: "desc" };

// localStorage 값을 hydration 안전하게 구독 (SSR/hydration 시엔 null).
function subscribeStorage(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}
function useStoredRaw(key: string): string | null {
  return useSyncExternalStore(
    subscribeStorage,
    () => window.localStorage.getItem(key),
    () => null,
  );
}
function parseView(raw: string | null): "list" | "grouped" | null {
  return raw === "list" || raw === "grouped" ? raw : null;
}
function parseSort(raw: string | null): SortState | null {
  if (!raw) return null;
  try {
    const p: unknown = JSON.parse(raw);
    if (p && typeof p === "object") {
      const { key, dir } = p as { key?: unknown; dir?: unknown };
      if (
        SORT_KEYS.includes(key as SortKey) &&
        (dir === "asc" || dir === "desc")
      ) {
        return { key: key as SortKey, dir };
      }
    }
  } catch {
    // 손상된 값은 무시하고 기본 정렬 사용
  }
  return null;
}

function SortTh({
  k,
  label,
  sort,
  onToggle,
  align = "left",
}: {
  k: SortKey;
  label: string;
  sort: SortState;
  onToggle: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === k;
  const arrow = active ? (sort.dir === "asc" ? "▲" : "▼") : "";
  return (
    <th
      className={`px-3 py-2 font-medium ${align === "right" ? "text-right" : "text-left"}`}
      aria-sort={
        active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        onClick={() => onToggle(k)}
        className={`inline-flex items-center gap-0.5 hover:text-slate-900 ${
          active ? "text-slate-900" : ""
        }`}
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
  const td = useTranslations("District");
  const tf = useTranslations("Fee");
  const trm = useTranslations("Rooms");
  const tl = useTranslations("Language");
  const tts = useTranslations("Tshirt");
  const tp = useTranslations("Pickup");
  const locale = useLocale();
  const dateFmt = new Intl.DateTimeFormat(
    locale === "en" ? "en-US" : locale === "es" ? "es-ES" : "ko-KR",
    { year: "numeric", month: "short", day: "numeric" },
  );
  const router = useRouter();
  const [, start] = useTransition();
  // 보기 모드·정렬 모두 마지막 선택을 localStorage에 보존해
  // 편집 페이지에서 돌아와도(어떤 경로든) 이전 상태로 복원된다.
  // 세션 내 전환은 override(state), 초기값은 저장소 구독 — SSR은 기본값.
  const storedView = parseView(useStoredRaw(VIEW_STORAGE_KEY));
  const [viewOverride, setViewOverride] = useState<"list" | "grouped" | null>(
    null,
  );
  const view = viewOverride ?? storedView ?? "grouped";
  function changeView(v: "list" | "grouped") {
    setViewOverride(v);
    window.localStorage.setItem(VIEW_STORAGE_KEY, v);
  }

  const storedSort = parseSort(useStoredRaw(SORT_STORAGE_KEY));
  const [sortOverride, setSortOverride] = useState<SortState | null>(null);
  const sort = sortOverride ?? storedSort ?? DEFAULT_SORT;
  function toggleSort(key: SortKey) {
    const next: SortState =
      sort.key === key
        ? { key, dir: sort.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" };
    setSortOverride(next);
    window.localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(next));
  }

  function changeLang(id: string, language: Language) {
    start(async () => {
      await setLanguage(id, language);
      router.refresh();
    });
  }

  function feeText(a: AttendeeWithRoom) {
    const f = personFee(a);
    if (a.fee_waived) return tf("waived");
    if (a.is_under_6) return tf("exempt");
    if (f == null) return tf("pending");
    // 교회 지원이 걸린 사람은 정가 → 실제 금액을 같이 보여준다.
    if (hasFeeDiscount(a)) {
      const base = personBaseFee(a);
      return (
        <span className="whitespace-nowrap">
          {base != null && (
            <span className="mr-1 text-slate-400 line-through">
              {formatUSD(base)}
            </span>
          )}
          {formatUSD(f)}
        </span>
      );
    }
    return formatUSD(f);
  }

  const householdsById = new Map(
    groupHouseholds(attendees).map((h) => [h.head.id, h]),
  );

  function balanceBadge(headId: string) {
    const h = householdsById.get(headId);
    const total = h?.total ?? 0;
    const paid = paidByHead[headId] ?? 0;
    const bal = householdBalance(total, paid);
    // 미산정 인원(객실 타입 미선택)이 있으면 아직 낼 금액이 정해지지 않은 상태 →
    // '정산 완료'가 아니라 중립 '회비 미산정'으로 표시(오해 방지). 납입액이 있으면
    // 예외적으로 잔액에 따라 처리(초과=환불).
    // 전원 면제(강사 등)·6세 미만이라 합계가 0인 방은 미산정이 아니라 정산 완료.
    const noFee = (h?.unassignedCount ?? 0) > 0 && paid === 0;
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
        {a.is_child_6_12 && (
          <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">
            {t("child612")}
          </span>
        )}
        {/* 리스트 보기엔 회비 열이 없으므로 면제는 배지로 표시 */}
        {a.fee_waived && (
          <span className="ml-2 rounded bg-teal-100 px-1.5 py-0.5 text-[11px] font-medium text-teal-700">
            {tf("waived")}
          </span>
        )}
        {hasFeeDiscount(a) && (
          <span className="ml-2 rounded bg-lime-100 px-1.5 py-0.5 text-[11px] font-medium text-lime-800">
            {tf("discountBadge", { pct: a.fee_discount_pct })}
          </span>
        )}
      </>
    );
  }

  // 두 보기가 공유하는 셀: 구역/부분참석/방/언어(+회비, 리스트 보기는 잔액 배지로 대체하므로 생략 가능)
  // 직분(role)은 화면에서 숨김 — Excel 내보내기에는 그대로 포함된다.
  function personCells(a: AttendeeWithRoom, opts?: { fee?: boolean }) {
    const showFee = opts?.fee ?? true;
    return (
      <>
        <td className="px-3 py-2 text-slate-600">
          {a.district ? td(a.district) : "—"}
        </td>
        {/* 부분 참석만 Y로 표시. 전일 참석은 공란(대다수라 잡음이 됨) */}
        <td className="px-3 py-2">
          {a.attendance === "partial" && (
            <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700">
              Y
            </span>
          )}
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
        <td className="px-3 py-2 text-slate-600">
          {a.tshirt_size ? tts(a.tshirt_size) : "—"}
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
    <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-slate-300">
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
    // 가구는 항상 한 덩어리로 유지하고, 가구 사이 순서만 정렬(기준=가구주 행).
    // 기본은 등록일 최신순 — 한 명이라도 최근 등록이면 그 가구가 맨 위로.
    const households = sortHouseholds(groupHouseholds(attendees), sort);
    // 정원이 다 안 찬 방 수 — 합방/정산 대상을 한눈에
    const notFull = households.filter((h) => householdOccupancy(h).under).length;
    return (
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {toggle}
          {notFull > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
              {trm("notFullRooms", { count: notFull })}
            </span>
          )}
        </div>
        <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
          <table className="min-w-full divide-y divide-slate-100 bg-white text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <SortTh k="name" label={t("colName")} sort={sort} onToggle={toggleSort} />
                <SortTh k="district" label={t("colDistrict")} sort={sort} onToggle={toggleSort} />
                <SortTh k="attendance" label={t("colPartial")} sort={sort} onToggle={toggleSort} />
                <SortTh k="room" label={t("colRoom")} sort={sort} onToggle={toggleSort} />
                <SortTh k="pickup" label={t("colPickup")} sort={sort} onToggle={toggleSort} />
                <SortTh k="language" label={t("colLanguage")} sort={sort} onToggle={toggleSort} />
                <SortTh k="tshirt" label={t("colTshirt")} sort={sort} onToggle={toggleSort} />
                <SortTh k="fee" label={t("colPaid")} sort={sort} onToggle={toggleSort} align="right" />
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
                // 방(가구)이 고른 객실 타입 정원 대비 숙박 인원
                const occ = householdOccupancy(h);
                const typeName = h.head.requested_room_type?.name;
                return (
                  <Fragment key={h.head.id}>
                    <tr
                      className={
                        occ.under
                          ? "bg-amber-50"
                          : occ.over
                            ? "bg-rose-50"
                            : "bg-slate-50"
                      }
                    >
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
                          {/* 정원 미달·초과 방을 구분 (인원 = 6세 미만·부분 참석 제외) */}
                          {occ.under && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                              {typeName ? `${typeName} · ` : ""}
                              {trm("occupancy", {
                                count: occ.occupants,
                                capacity: occ.capacity ?? 0,
                              })}
                              {` · ${trm("openBeds", { count: occ.openBeds })}`}
                            </span>
                          )}
                          {occ.over && (
                            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-medium text-rose-700">
                              {typeName ? `${typeName} · ` : ""}
                              {trm("occupancy", {
                                count: occ.occupants,
                                capacity: occ.capacity ?? 0,
                              })}
                              {` · ${trm("overCapacity")}`}
                            </span>
                          )}
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
      <div className="mb-3">{toggle}</div>
      <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
        <table className="min-w-full divide-y divide-slate-100 bg-white text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <SortTh k="name" label={t("colName")} sort={sort} onToggle={toggleSort} />
              <SortTh
                k="household"
                label={t("colHousehold")}
                sort={sort}
                onToggle={toggleSort}
              />
              <SortTh
                k="district"
                label={t("colDistrict")}
                sort={sort}
                onToggle={toggleSort}
              />
              <SortTh
                k="attendance"
                label={t("colPartial")}
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
                k="pickup"
                label={t("colPickup")}
                sort={sort}
                onToggle={toggleSort}
              />
              <SortTh
                k="language"
                label={t("colLanguage")}
                sort={sort}
                onToggle={toggleSort}
              />
              <SortTh
                k="tshirt"
                label={t("colTshirt")}
                sort={sort}
                onToggle={toggleSort}
              />
              {/* 잔액은 방 단위 배지라 정렬 대상 아님 */}
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
