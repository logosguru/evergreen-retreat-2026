import { groupHouseholds, type AttendeeWithRoom } from "./fees";

// 대시보드 정원 집계용 rooms 조회 형태: rooms + room_types(name, capacity)
export type RoomForStats = {
  room_types: { name: string; capacity: number } | null;
};

export interface RoomOccupancy {
  name: string;
  occupied: number; // 배정된 비-6세미만 인원
  capacityTotal: number; // 해당 타입 객실 정원 합
  roomCount: number;
}

export interface CountItem {
  key: string;
  count: number;
}

export interface DashboardStats {
  totalPeople: number;
  households: number;
  under6: number;
  full: number;
  partial: number;
  language: { ko: number; en: number; es: number };
  assigned: number; // room_id 있는 인원(6세미만 포함)
  unassigned: number; // 6세미만 아닌데 미배정
  rooms: RoomOccupancy[];
  grandTotal: number;
  paidTotal: number;
  unpaidTotal: number;
  paidHouseholds: number;
  byDistrict: CountItem[];
  byRole: CountItem[];
}

export function computeDashboard(
  attendees: AttendeeWithRoom[],
  rooms: RoomForStats[],
): DashboardStats {
  const households = groupHouseholds(attendees);
  const grandTotal = households.reduce((s, h) => s + h.total, 0);
  const paidTotal = households
    .filter((h) => h.head.paid)
    .reduce((s, h) => s + h.total, 0);

  // 객실 타입별 정원/방수
  const cap = new Map<string, { capacityTotal: number; roomCount: number }>();
  for (const r of rooms) {
    const name = r.room_types?.name;
    if (!name) continue;
    const cur = cap.get(name) ?? { capacityTotal: 0, roomCount: 0 };
    cur.capacityTotal += r.room_types!.capacity;
    cur.roomCount += 1;
    cap.set(name, cur);
  }
  // 타입별 점유(배정된 비-6세미만; 6세미만은 정원 미집계)
  const occ = new Map<string, number>();
  for (const a of attendees) {
    if (a.room_id == null || a.is_under_6) continue;
    const name = a.rooms?.room_types?.name;
    if (!name) continue;
    occ.set(name, (occ.get(name) ?? 0) + 1);
  }
  const names = new Set<string>([...cap.keys(), ...occ.keys()]);
  const roomsStats: RoomOccupancy[] = [...names]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name,
      occupied: occ.get(name) ?? 0,
      capacityTotal: cap.get(name)?.capacityTotal ?? 0,
      roomCount: cap.get(name)?.roomCount ?? 0,
    }));

  const tally = (sel: (a: AttendeeWithRoom) => string | null): CountItem[] => {
    const m = new Map<string, number>();
    for (const a of attendees) {
      const k = sel(a);
      if (k == null || k === "") continue;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([key, count]) => ({ key, count }));
  };

  return {
    totalPeople: attendees.length,
    households: households.length,
    under6: attendees.filter((a) => a.is_under_6).length,
    full: attendees.filter((a) => a.attendance === "full").length,
    partial: attendees.filter((a) => a.attendance === "partial").length,
    language: {
      ko: attendees.filter((a) => a.language === "ko").length,
      en: attendees.filter((a) => a.language === "en").length,
      es: attendees.filter((a) => a.language === "es").length,
    },
    assigned: attendees.filter((a) => a.room_id != null).length,
    unassigned: attendees.filter((a) => a.room_id == null && !a.is_under_6)
      .length,
    rooms: roomsStats,
    grandTotal,
    paidTotal,
    unpaidTotal: grandTotal - paidTotal,
    paidHouseholds: households.filter((h) => h.head.paid).length,
    byDistrict: tally((a) => a.district).sort((x, y) =>
      x.key.localeCompare(y.key),
    ),
    byRole: tally((a) => a.role),
  };
}
