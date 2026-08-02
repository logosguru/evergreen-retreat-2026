import type { AttendeeWithRoom } from "./fees.ts";

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
