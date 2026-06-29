"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { Room, RoomType } from "@/lib/types";
import { formatUSD } from "@/lib/fees";
import {
  upsertRoomType,
  deleteRoomType,
  upsertRoom,
  deleteRoom,
} from "@/app/[locale]/admin/rooms-actions";

const input =
  "rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

export function RoomManager({
  roomTypes,
  rooms,
}: {
  roomTypes: RoomType[];
  rooms: Room[];
}) {
  const t = useTranslations("Rooms");
  const router = useRouter();
  const [, start] = useTransition();

  // 새 객실 타입 입력
  const [tName, setTName] = useState("");
  const [tCap, setTCap] = useState(4);
  const [tPrice, setTPrice] = useState(200);
  // 새 호실 입력
  const [rLabel, setRLabel] = useState("");
  const [rType, setRType] = useState("");

  function refresh() {
    router.refresh();
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
    if (!rLabel.trim() || !rType) return;
    start(async () => {
      await upsertRoom({
        label: rLabel,
        room_type_id: rType,
        sort_order: rooms.length + 1,
      });
      setRLabel("");
      refresh();
    });
  }

  const typeName = (id: string) =>
    roomTypes.find((rt) => rt.id === id)?.name ?? "?";

  return (
    <div className="space-y-10">
      {/* 객실 타입 */}
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

      {/* 호실 */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          {t("rooms")}
        </h2>
        <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
          {rooms.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-500">{t("empty")}</li>
          )}
          {rooms.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <span className="text-slate-800">
                {r.label} · {typeName(r.room_type_id)}
              </span>
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
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input
            className={input}
            placeholder={t("label")}
            value={rLabel}
            onChange={(e) => setRLabel(e.target.value)}
          />
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
