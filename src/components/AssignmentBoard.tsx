"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { Room, RoomGrade, RoomType } from "@/lib/types";
import { occupiesRoom, type AttendeeWithRoom } from "@/lib/fees";
import { gradeUsage } from "@/lib/rooms";
import { assignRoom } from "@/app/[locale]/(site)/admin/assignment-actions";
import { displayName } from "@/lib/names";

type RoomWithType = Room & { room_types: RoomType };

// 정원 집계: 실제 숙박 인원만 (6세 미만·부분 참석 제외 — fees.occupiesRoom)
function counted(list: AttendeeWithRoom[]) {
  return list.filter(occupiesRoom).length;
}

export function AssignmentBoard({
  grades,
  rooms,
  attendees,
}: {
  grades: RoomGrade[];
  rooms: RoomWithType[];
  attendees: AttendeeWithRoom[];
}) {
  const t = useTranslations("Rooms");
  const ta = useTranslations("Attendance");
  const router = useRouter();
  const [, start] = useTransition();

  function move(id: string, roomId: string | null) {
    start(async () => {
      await assignRoom(id, roomId);
      router.refresh();
    });
  }

  const usage = gradeUsage(grades, rooms);
  const gradeLabel = (id: string) => {
    const g = grades.find((g) => g.id === id);
    return g ? t(`grade.${g.name}`) : "?";
  };

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
          {r.label} ({gradeLabel(r.grade_id)}·{r.room_types.name})
        </option>
      ))}
    </select>
  );

  const roomCard = (r: RoomWithType) => {
    const occupants = attendees.filter((a) => a.room_id === r.id);
    const n = counted(occupants);
    const capacity = r.room_types.capacity;
    const over = n > capacity;
    // 빈자리 있는 방(= 아직 채워지지 않은 방). 아무도 없는 방은 한눈에 보이므로
    // 강조 대상에서 제외하고, "3/4"처럼 일부만 찬 방만 앰버로 눈에 띄게 한다.
    const partiallyFilled = n > 0 && n < capacity;
    return (
      <div
        key={r.id}
        className={`rounded-xl bg-white p-4 ring-1 ${
          over
            ? "ring-rose-300"
            : partiallyFilled
              ? "ring-2 ring-amber-300"
              : "ring-slate-200"
        }`}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-900">
            {r.label}{" "}
            <span className="text-xs font-normal text-slate-400">
              {gradeLabel(r.grade_id)}·{t(`bed.${r.bed_type}`)}·
              {r.room_types.name}
            </span>
          </h3>
          <span
            className={
              over
                ? "shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700"
                : partiallyFilled
                  ? "shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                  : "shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
            }
          >
            {t("occupancy", { count: n, capacity })}
            {over ? ` · ${t("overCapacity")}` : ""}
            {partiallyFilled ? ` · ${t("openBeds", { count: capacity - n })}` : ""}
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
                {/* 부분 참석은 숙박하지 않아 정원에 안 잡힘 — 숫자 차이를 설명 */}
                {a.attendance === "partial" && (
                  <span className="ml-1 text-xs text-violet-600">
                    ({ta("partial")})
                  </span>
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
  };

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

      {/* 등급별 호실 섹션 */}
      {grades.map((g) => {
        const list = rooms.filter((r) => r.grade_id === g.id);
        if (list.length === 0) return null;
        const u = usage.get(g.id);
        // 이 등급에서 아직 다 안 찬 방 수 (합방 여지 파악용)
        const notFull = list.filter((r) => {
          const n = counted(attendees.filter((a) => a.room_id === r.id));
          return n > 0 && n < r.room_types.capacity;
        }).length;
        return (
          <section key={g.id}>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
              {t(`grade.${g.name}`)}
              {u && (
                <span
                  className={
                    u.over
                      ? "rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700"
                      : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600"
                  }
                >
                  {u.quota == null
                    ? t("gradeUsageUnlimited", { used: u.used })
                    : t("gradeUsage", { used: u.used, quota: u.quota })}
                  {u.over ? ` · ${t("quotaOver")}` : ""}
                </span>
              )}
              {notFull > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  {t("notFullRooms", { count: notFull })}
                </span>
              )}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {list.map(roomCard)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
