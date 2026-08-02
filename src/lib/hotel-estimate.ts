import type { AttendeeWithRoom, Household } from "./fees.ts";
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

export function estimateHotelRooms(
  attendees: AttendeeWithRoom[],
  assumedCapacity: AssumedCapacity,
): HotelEstimate {
  void attendees;
  return {
    decided: [],
    assumed: null,
    totalRooms: 0,
    totalPeople: 0,
    under6: 0,
    partialCount: 0,
    unknownGenderHouseholds: 0,
    zeroOccupancyHouseholds: 0,
    unlinkedAttendees: 0,
    assumedCapacity,
  };
}
