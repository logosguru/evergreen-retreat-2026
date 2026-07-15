import {
  groupHouseholds,
  withHouseholdRoomType,
  householdBalance,
  type AttendeeWithRoom,
} from "./fees";

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
  collected: number; // 수납 합계(net, 환불 반영)
  outstanding: number; // 미납 합계 Σmax(0, balance)
  refundDue: number; // 환불 필요 합계 Σmax(0, -balance)
  settledHouseholds: number; // 정산 완료(total>0 && balance<=0) 가구 수
  byDistrict: CountItem[];
  byRole: CountItem[];
}

export function computeDashboard(
  attendees: AttendeeWithRoom[],
  rooms: RoomForStats[],
  paid: Map<string, number>,
): DashboardStats {
  const households = groupHouseholds(withHouseholdRoomType(attendees));
  const grandTotal = households.reduce((s, h) => s + h.total, 0);
  let collected = 0;
  let outstanding = 0;
  let refundDue = 0;
  let settledHouseholds = 0;
  for (const h of households) {
    const p = paid.get(h.head.id) ?? 0;
    const bal = householdBalance(h.total, p);
    collected += p;
    if (bal > 0) outstanding += bal;
    if (bal < 0) refundDue += -bal;
    if (h.total > 0 && bal <= 0) settledHouseholds += 1;
  }

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
    collected,
    outstanding,
    refundDue,
    settledHouseholds,
    byDistrict: tally((a) => a.district).sort((x, y) =>
      x.key.localeCompare(y.key),
    ),
    byRole: tally((a) => a.role),
  };
}
