import {
  groupHouseholds,
  withHouseholdRoomType,
  type AttendeeWithRoom,
  type Household,
} from "./fees.ts";
import type { Gender } from "./types.ts";

// 호텔 예약 협상용 방 갯수 추정. 실제 물리적 배정은 /admin/assignments 담당.
export type AssumedCapacity = 2 | 3 | 4;
export const ASSUMED_CAPACITIES: readonly AssumedCapacity[] = [2, 3, 4];

export interface EstimateBucket {
  capacity: number;
  households: number;
  people: number; // 정원 집계 인원 (6세 미만 제외)
  familyRooms: number; // 가구 전용방
  sharedRooms: number; // 성별 합방
  rooms: number; // familyRooms + sharedRooms
}

export interface HotelEstimate {
  decided: EstimateBucket[]; // 타입 선택 완료, capacity 오름차순
  assumed: EstimateBucket | null; // 미선택 가구 (없으면 null)
  totalRooms: number;
  totalPeople: number;
  under6: number;
  partialCount: number;
  unknownGenderHouseholds: number;
  zeroOccupancyHouseholds: number;
  unlinkedAttendees: number;
  assumedCapacity: AssumedCapacity;
}

// 정원에 집계되는 가구원. 6세 미만은 회비·정원 규정상 제외(호텔엔 별도 고지).
export function householdOccupants(h: Household): AttendeeWithRoom[] {
  return [h.head, ...h.members].filter((p) => !p.is_under_6);
}

// 성별 합방 가능 여부. 전원 동일 성별일 때만 그 성별을 반환.
// 혼성(부부 등)이나 성별 미입력이 섞이면 null → 합방 불가, 전용방 처리.
export function soleGender(occupants: AttendeeWithRoom[]): Gender | null {
  const first = occupants[0]?.gender;
  if (!first) return null;
  return occupants.every((p) => p.gender === first) ? first : null;
}

// 버킷별 누산기. pool = 성별 → 합방 대상 인원 합.
interface Acc {
  households: number;
  people: number;
  familyRooms: number;
  pool: Map<Gender, number>;
}

function newAcc(): Acc {
  return { households: 0, people: 0, familyRooms: 0, pool: new Map() };
}

function finishAcc(acc: Acc, capacity: number): EstimateBucket {
  let sharedRooms = 0;
  for (const people of acc.pool.values()) {
    sharedRooms += Math.ceil(people / capacity);
  }
  return {
    capacity,
    households: acc.households,
    people: acc.people,
    familyRooms: acc.familyRooms,
    sharedRooms,
    rooms: acc.familyRooms + sharedRooms,
  };
}

export function estimateHotelRooms(
  attendees: AttendeeWithRoom[],
  assumedCapacity: AssumedCapacity,
): HotelEstimate {
  const rows = withHouseholdRoomType(attendees);
  const households = groupHouseholds(rows);

  const decidedAcc = new Map<number, Acc>();
  const assumedAcc = newAcc();
  let unknownGenderHouseholds = 0;
  let zeroOccupancyHouseholds = 0;

  for (const h of households) {
    const occupants = householdOccupants(h);
    if (occupants.length === 0) {
      zeroOccupancyHouseholds += 1;
      continue;
    }

    const chosen = h.head.requested_room_type?.capacity;
    // capacity 0/음수는 DB상 없어야 하지만 들어오면 ceil이 Infinity가 되므로 하한 1.
    const capacity = Math.max(1, chosen ?? assumedCapacity);

    let acc: Acc;
    if (chosen == null) {
      acc = assumedAcc;
    } else {
      const existing = decidedAcc.get(capacity);
      acc = existing ?? newAcc();
      if (!existing) decidedAcc.set(capacity, acc);
    }

    acc.households += 1;
    acc.people += occupants.length;

    if (occupants.length <= 2) {
      const g = soleGender(occupants);
      if (g) {
        acc.pool.set(g, (acc.pool.get(g) ?? 0) + occupants.length);
      } else {
        // 혼성(부부) 또는 성별 미입력 → 합방 불가, 전용방.
        acc.familyRooms += 1;
        if (occupants.some((p) => p.gender == null)) {
          unknownGenderHouseholds += 1;
        }
      }
    } else {
      acc.familyRooms += Math.ceil(occupants.length / capacity);
    }
  }

  const decided = [...decidedAcc.entries()]
    .sort(([a], [b]) => a - b)
    .map(([capacity, acc]) => finishAcc(acc, capacity));
  const assumed =
    assumedAcc.households > 0 ? finishAcc(assumedAcc, assumedCapacity) : null;

  const buckets = assumed ? [...decided, assumed] : decided;

  let totalRooms = 0;
  let totalPeople = 0;
  for (const b of buckets) {
    totalRooms += b.rooms;
    totalPeople += b.people;
  }

  // 참석자 단위 카운터는 한 번만 순회한다 (filter 3번 대신).
  let under6 = 0;
  let partialCount = 0;
  let unlinkedAttendees = 0;
  for (const a of rows) {
    if (a.is_under_6) under6 += 1;
    if (a.attendance === "partial") partialCount += 1;
    // 가구주도 아니고 가구주 링크도 없는 행 = 방 산정에서 누락됨. 조용히 빠지면
    // 호텔에 틀린 숫자를 주게 되므로 드러낸다. (0010 마이그레이션 이후 정상은 0)
    if (!a.is_householder && a.householder_id == null) unlinkedAttendees += 1;
  }

  return {
    decided,
    assumed,
    totalRooms,
    totalPeople,
    under6,
    partialCount,
    unknownGenderHouseholds,
    zeroOccupancyHouseholds,
    unlinkedAttendees,
    assumedCapacity,
  };
}
