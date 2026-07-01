"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { Room, RoomType } from "@/lib/types";
import type { AttendeeWithRoom } from "@/lib/fees";
import { assignRoom } from "@/app/[locale]/admin/assignment-actions";
import { displayName } from "@/lib/names";

type RoomWithType = Room & { room_types: RoomType };

// 정원 집계: 6세 미만 제외
function counted(list: AttendeeWithRoom[]) {
  return list.filter((a) => !a.is_under_6).length;
}

export function AssignmentBoard({
  rooms,
  attendees,
}: {
  rooms: RoomWithType[];
  attendees: AttendeeWithRoom[];
}) {
  const t = useTranslations("Rooms");
  const router = useRouter();
  const [, start] = useTransition();

  function move(id: string, roomId: string | null) {
    start(async () => {
      await assignRoom(id, roomId);
      router.refresh();
    });
  }

  const unassigned = attendees.filter((a) => a.room_id == null);
  const roomDropdown = (a: AttendeeWithRoom) => (
    <select
      value={a.room_id ?? ""}
      onChange={(e) => move(a.id, e.target.value || null)}
      className="rounded border border-slate-300 px-1.5 py-0.5 text-xs"
    >
      <option value="">{t("noRoom")}</option>
      {rooms.map((r) => (
        <option key={r.id} value={r.id}>
          {r.label} ({r.room_types.name})
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-8">
      {/* 미배정 */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">
          {t("unassigned")} ({unassigned.length})
        </h2>
        <ul className="space-y-1">
          {unassigned.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded bg-amber-50 px-3 py-1.5 text-sm ring-1 ring-amber-100"
            >
              <span>
                {displayName(a)}
                {a.is_under_6 && (
                  <span className="ml-1 text-xs text-amber-600">(6&lt;)</span>
                )}
              </span>
              {roomDropdown(a)}
            </li>
          ))}
        </ul>
      </section>

      {/* 호실별 카드 = 배치 현황표 */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {rooms.map((r) => {
          const occupants = attendees.filter((a) => a.room_id === r.id);
          const n = counted(occupants);
          const over = n > r.room_types.capacity;
          return (
            <div
              key={r.id}
              className="rounded-xl bg-white p-4 ring-1 ring-slate-200"
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">
                  {r.label}{" "}
                  <span className="text-xs font-normal text-slate-400">
                    {r.room_types.name}
                  </span>
                </h3>
                <span
                  className={
                    over
                      ? "rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700"
                      : "rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                  }
                >
                  {t("occupancy", { count: n, capacity: r.room_types.capacity })}
                  {over ? ` · ${t("overCapacity")}` : ""}
                </span>
              </div>
              <ul className="space-y-1">
                {occupants.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span>
                      {displayName(a)}
                      {a.is_under_6 && (
                        <span className="ml-1 text-xs text-amber-600">(6&lt;)</span>
                      )}
                    </span>
                    {roomDropdown(a)}
                  </li>
                ))}
                {occupants.length === 0 && (
                  <li className="text-xs text-slate-400">{t("empty")}</li>
                )}
              </ul>
            </div>
          );
        })}
      </section>
    </div>
  );
}
