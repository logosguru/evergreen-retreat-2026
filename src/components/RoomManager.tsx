"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { BedType, Room, RoomGrade, RoomType } from "@/lib/types";
import { BED_TYPES } from "@/lib/types";
import { formatUSD } from "@/lib/fees";
import { gradeUsage } from "@/lib/rooms";
import {
  upsertRoomType,
  deleteRoomType,
  upsertRoom,
  deleteRoom,
  updateGradeQuota,
} from "@/app/[locale]/admin/rooms-actions";

const input =
  "rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

export function RoomManager({
  grades,
  roomTypes,
  rooms,
}: {
  grades: RoomGrade[];
  roomTypes: RoomType[];
  rooms: Room[];
}) {
  const t = useTranslations("Rooms");
  const router = useRouter();
  const [, start] = useTransition();

  // 등급 쿼터 입력 (빈값 = 무제한)
  const [quotaDraft, setQuotaDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(grades.map((g) => [g.id, g.quota?.toString() ?? ""])),
  );
  // 새 객실 타입 입력
  const [tName, setTName] = useState("");
  const [tCap, setTCap] = useState(4);
  const [tPrice, setTPrice] = useState(200);
  // 새 호실 입력
  const [rLabel, setRLabel] = useState("");
  const [rType, setRType] = useState("");
  const [rGrade, setRGrade] = useState(grades[0]?.id ?? "");
  const [rBed, setRBed] = useState<BedType>("double");

  const usage = gradeUsage(grades, rooms);

  function refresh() {
    router.refresh();
  }

  function saveQuota(g: RoomGrade) {
    const draft = quotaDraft[g.id]?.trim() ?? "";
    start(async () => {
      await updateGradeQuota(g.id, draft === "" ? null : Number(draft));
      refresh();
    });
  }

  function addType() {
    if (!tName.trim()) return;
    start(async () => {
      await upsertRoomType({
        name: tName,
        capacity: tCap,
        price_per_person: tPrice,
        sort_order: roomTypes.length + 1,
      });
      setTName("");
      refresh();
    });
  }

  function addRoom() {
    if (!rLabel.trim() || !rType || !rGrade) return;
    start(async () => {
      await upsertRoom({
        label: rLabel,
        room_type_id: rType,
        grade_id: rGrade,
        bed_type: rBed,
        sort_order: rooms.length + 1,
      });
      setRLabel("");
      refresh();
    });
  }

  // 기존 호실의 등급/침대 인라인 수정 (나머지 필드는 그대로 재전송)
  function patchRoom(
    r: Room,
    patch: Partial<Pick<Room, "grade_id" | "bed_type">>,
  ) {
    start(async () => {
      await upsertRoom({
        id: r.id,
        label: r.label,
        room_type_id: r.room_type_id,
        grade_id: patch.grade_id ?? r.grade_id,
        bed_type: patch.bed_type ?? r.bed_type,
        note: r.note ?? undefined,
        sort_order: r.sort_order,
      });
      refresh();
    });
  }

  const typeName = (id: string) =>
    roomTypes.find((rt) => rt.id === id)?.name ?? "?";

  const usageBadge = (g: RoomGrade) => {
    const u = usage.get(g.id);
    if (!u) return null;
    return (
      <span
        className={
          u.over
            ? "rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700"
            : "rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
        }
      >
        {u.quota == null
          ? t("gradeUsageUnlimited", { used: u.used })
          : t("gradeUsage", { used: u.used, quota: u.quota })}
        {u.over ? ` · ${t("quotaOver")}` : ""}
      </span>
    );
  };

  return (
    <div className="space-y-10">
      {/* 객실 등급 (쿼터만 수정 가능, 등급 CRUD 없음) */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          {t("grades")}
        </h2>
        <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
          {grades.map((g) => (
            <li
              key={g.id}
              className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
            >
              <span className="w-28 font-medium text-slate-800">
                {t(`grade.${g.name}`)}
              </span>
              {usageBadge(g)}
              <span className="ml-auto flex items-center gap-2">
                <label className="text-xs text-slate-500">{t("quota")}</label>
                <input
                  className={`${input} w-20`}
                  type="number"
                  min={0}
                  placeholder={t("unlimited")}
                  value={quotaDraft[g.id] ?? ""}
                  onChange={(e) =>
                    setQuotaDraft((d) => ({ ...d, [g.id]: e.target.value }))
                  }
                />
                <button
                  onClick={() => saveQuota(g)}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  {t("save")}
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* 회비 타입 (성도 화면용 2/3/4인실) — 기존 그대로 */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          {t("roomTypes")}
        </h2>
        <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
          {roomTypes.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-500">{t("empty")}</li>
          )}
          {roomTypes.map((rt) => (
            <li
              key={rt.id}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <span className="text-slate-800">
                {rt.name} · {t("capacity")} {rt.capacity} ·{" "}
                {formatUSD(rt.price_per_person)}
              </span>
              <button
                onClick={() =>
                  start(async () => {
                    await deleteRoomType(rt.id);
                    refresh();
                  })
                }
                className="text-rose-600 hover:text-rose-700"
              >
                {t("delete")}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input
            className={input}
            placeholder={t("name")}
            value={tName}
            onChange={(e) => setTName(e.target.value)}
          />
          <input
            className={`${input} w-20`}
            type="number"
            min={1}
            value={tCap}
            onChange={(e) => setTCap(Number(e.target.value))}
          />
          <input
            className={`${input} w-24`}
            type="number"
            min={0}
            value={tPrice}
            onChange={(e) => setTPrice(Number(e.target.value))}
          />
          <button
            onClick={addType}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            {t("add")}
          </button>
        </div>
      </section>

      {/* 호실 — 등급별 그룹 + 등급/침대 인라인 수정 */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          {t("rooms")}
        </h2>
        {rooms.length === 0 && (
          <p className="rounded-lg px-3 py-2 text-sm text-slate-500 ring-1 ring-slate-200">
            {t("empty")}
          </p>
        )}
        <div className="space-y-4">
          {grades.map((g) => {
            const list = rooms.filter((r) => r.grade_id === g.id);
            if (list.length === 0) return null;
            return (
              <div key={g.id}>
                <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  {t(`grade.${g.name}`)} {usageBadge(g)}
                </h3>
                <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
                  {list.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
                    >
                      <span className="text-slate-800">
                        {r.label} · {typeName(r.room_type_id)}
                      </span>
                      <span className="ml-auto flex items-center gap-2">
                        <select
                          className={input}
                          value={r.grade_id}
                          onChange={(e) =>
                            patchRoom(r, { grade_id: e.target.value })
                          }
                        >
                          {grades.map((gg) => (
                            <option key={gg.id} value={gg.id}>
                              {t(`grade.${gg.name}`)}
                            </option>
                          ))}
                        </select>
                        <select
                          className={input}
                          value={r.bed_type}
                          onChange={(e) =>
                            patchRoom(r, {
                              bed_type: e.target.value as BedType,
                            })
                          }
                        >
                          {BED_TYPES.map((b) => (
                            <option key={b} value={b}>
                              {t(`bed.${b}`)}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() =>
                            start(async () => {
                              await deleteRoom(r.id);
                              refresh();
                            })
                          }
                          className="text-rose-600 hover:text-rose-700"
                        >
                          {t("delete")}
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input
            className={input}
            placeholder={t("label")}
            value={rLabel}
            onChange={(e) => setRLabel(e.target.value)}
          />
          <select
            className={input}
            value={rGrade}
            onChange={(e) => setRGrade(e.target.value)}
          >
            {grades.map((g) => (
              <option key={g.id} value={g.id}>
                {t(`grade.${g.name}`)}
              </option>
            ))}
          </select>
          <select
            className={input}
            value={rBed}
            onChange={(e) => setRBed(e.target.value as BedType)}
          >
            {BED_TYPES.map((b) => (
              <option key={b} value={b}>
                {t(`bed.${b}`)}
              </option>
            ))}
          </select>
          <select
            className={input}
            value={rType}
            onChange={(e) => setRType(e.target.value)}
          >
            <option value="">{t("type")}</option>
            {roomTypes.map((rt) => (
              <option key={rt.id} value={rt.id}>
                {rt.name}
              </option>
            ))}
          </select>
          <button
            onClick={addRoom}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            {t("add")}
          </button>
        </div>
      </section>
    </div>
  );
}
