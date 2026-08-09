import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estimateHotelRooms,
  householdOccupants,
  soleGender,
} from "./hotel-estimate.ts";
import { groupHouseholds, type AttendeeWithRoom } from "./fees.ts";

let seq = 0;

// Attendee 필수 필드가 많아 기본값 픽스처를 두고 필요한 것만 덮어쓴다.
function makeAttendee(over: Partial<AttendeeWithRoom> = {}): AttendeeWithRoom {
  seq += 1;
  return {
    id: `a${seq}`,
    korean_name: `사람${seq}`,
    english_name: null,
    district: null,
    gender: "male",
    role: "member",
    is_householder: false,
    householder_id: null,
    retreat_group: null,
    is_group_leader: false,
    note: null,
    email: null,
    phone: null,
    room_id: null,
    requested_room_type_id: null,
    language: "ko",
    is_under_6: false,
    is_child_6_12: false,
    fee_waived: false,
    tshirt_size: null,
    attendance: "full",
    pickup_location: null,
    arrival_at: null,
    departure_at: null,
    paid: false,
    paid_at: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    rooms: null,
    requested_room_type: null,
    ...over,
  };
}

test("빈 명단이면 방 0개", () => {
  const est = estimateHotelRooms([], 4);
  assert.equal(est.totalRooms, 0);
  assert.equal(est.assumed, null);
  assert.deepEqual(est.decided, []);
});

test("householdOccupants: 6세 미만·부분참석은 정원 집계에서 제외", () => {
  const head = makeAttendee({ id: "h1", is_householder: true });
  const adult = makeAttendee({ householder_id: "h1" });
  const baby = makeAttendee({ householder_id: "h1", is_under_6: true });
  const dayOnly = makeAttendee({ householder_id: "h1", attendance: "partial" });
  const [hh] = groupHouseholds([head, adult, baby, dayOnly]);
  assert.equal(householdOccupants(hh).length, 2);
});

test("soleGender: 전원 동일 성별이면 그 성별", () => {
  const a = makeAttendee({ gender: "male" });
  const b = makeAttendee({ gender: "male" });
  assert.equal(soleGender([a, b]), "male");
});

test("soleGender: 혼성이면 null", () => {
  const a = makeAttendee({ gender: "male" });
  const b = makeAttendee({ gender: "female" });
  assert.equal(soleGender([a, b]), null);
});

test("soleGender: 성별 미입력이 섞이면 null", () => {
  const a = makeAttendee({ gender: "male" });
  const b = makeAttendee({ gender: null });
  assert.equal(soleGender([a, b]), null);
});

test("soleGender: 빈 배열이면 null", () => {
  assert.equal(soleGender([]), null);
});

const TWO = { name: "2인실", price_per_person: 300, capacity: 2 };
const THREE = { name: "3인실", price_per_person: 250, capacity: 3 };
const FOUR = { name: "4인실", price_per_person: 200, capacity: 4 };

// 가구 1개 생성: head + (size-1)명. type=null 이면 미선택 가구.
function household(
  id: string,
  size: number,
  type: { name: string; price_per_person: number; capacity: number } | null,
  over: Partial<AttendeeWithRoom> = {},
): AttendeeWithRoom[] {
  const head = makeAttendee({
    id,
    is_householder: true,
    requested_room_type_id: type ? `rt-${type.capacity}` : null,
    requested_room_type: type,
    ...over,
  });
  const rest = Array.from({ length: size - 1 }, () =>
    makeAttendee({ householder_id: id, ...over }),
  );
  return [head, ...rest];
}

test("occupancy 5명 / 4인실 → ceil = 2방", () => {
  const est = estimateHotelRooms(household("h1", 5, FOUR), 4);
  assert.equal(est.decided.length, 1);
  assert.equal(est.decided[0].capacity, 4);
  assert.equal(est.decided[0].familyRooms, 2);
  assert.equal(est.decided[0].sharedRooms, 0);
  assert.equal(est.totalRooms, 2);
  assert.equal(est.totalPeople, 5);
});

test("성인 4 + 유아 1 / 4인실 → 1방 (유아는 정원 미집계)", () => {
  const rows = household("h1", 4, FOUR);
  rows.push(makeAttendee({ householder_id: "h1", is_under_6: true }));
  const est = estimateHotelRooms(rows, 4);
  assert.equal(est.totalRooms, 1);
  assert.equal(est.totalPeople, 4);
  assert.equal(est.under6, 1);
});

test("동일 성별 1인 가구 3개 / 4인실 → 합방 1방", () => {
  const rows = [
    ...household("h1", 1, FOUR, { gender: "male" }),
    ...household("h2", 1, FOUR, { gender: "male" }),
    ...household("h3", 1, FOUR, { gender: "male" }),
  ];
  const est = estimateHotelRooms(rows, 4);
  assert.equal(est.decided[0].sharedRooms, 1);
  assert.equal(est.decided[0].familyRooms, 0);
  assert.equal(est.totalRooms, 1);
});

test("남/여 합방 풀은 서로 섞이지 않음", () => {
  const rows = [
    ...household("h1", 1, FOUR, { gender: "male" }),
    ...household("h2", 1, FOUR, { gender: "female" }),
  ];
  const est = estimateHotelRooms(rows, 4);
  assert.equal(est.totalRooms, 2);
});

test("혼성 2인 가구(부부)는 전용방 1개, unknownGender 아님", () => {
  const rows = household("h1", 2, FOUR);
  rows[1] = makeAttendee({ householder_id: "h1", gender: "female" });
  const est = estimateHotelRooms(rows, 4);
  assert.equal(est.decided[0].familyRooms, 1);
  assert.equal(est.decided[0].sharedRooms, 0);
  assert.equal(est.unknownGenderHouseholds, 0);
});

test("성별 미입력 1인 가구는 전용방 + unknownGenderHouseholds 증가", () => {
  const est = estimateHotelRooms(household("h1", 1, FOUR, { gender: null }), 4);
  assert.equal(est.decided[0].familyRooms, 1);
  assert.equal(est.unknownGenderHouseholds, 1);
});

test("전원 6세 미만 가구는 버킷 제외 + zeroOccupancy 증가", () => {
  const est = estimateHotelRooms(
    household("h1", 2, FOUR, { is_under_6: true }),
    4,
  );
  assert.equal(est.decided.length, 0);
  assert.equal(est.totalRooms, 0);
  assert.equal(est.zeroOccupancyHouseholds, 1);
});

test("확정과 가정은 같은 성별·정원이어도 합방하지 않음", () => {
  const rows = [
    ...household("h1", 1, FOUR, { gender: "male" }),
    ...household("h2", 1, null, { gender: "male" }),
  ];
  const est = estimateHotelRooms(rows, 4);
  assert.equal(est.decided[0].sharedRooms, 1);
  assert.equal(est.assumed?.sharedRooms, 1);
  assert.equal(est.totalRooms, 2);
});

test("assumedCapacity 전환은 가정 버킷만 바꾼다", () => {
  const rows = [...household("h1", 3, TWO), ...household("h2", 6, null)];
  const at4 = estimateHotelRooms(rows, 4);
  const at2 = estimateHotelRooms(rows, 2);
  assert.equal(at4.assumed?.rooms, 2); // ceil(6/4)
  assert.equal(at2.assumed?.rooms, 3); // ceil(6/2)
  assert.equal(at4.decided[0].rooms, at2.decided[0].rooms); // ceil(3/2)=2
  assert.equal(at2.assumedCapacity, 2);
});

test("decided 버킷은 capacity 오름차순", () => {
  const rows = [
    ...household("h1", 3, FOUR),
    ...household("h2", 3, TWO),
    ...household("h3", 3, THREE),
  ];
  const est = estimateHotelRooms(rows, 4);
  assert.deepEqual(
    est.decided.map((b) => b.capacity),
    [2, 3, 4],
  );
});

test("전원 부분참석 가구는 숙박이 없어 방 산정에서 빠진다", () => {
  const rows = household("h1", 3, FOUR, { attendance: "partial" });
  const est = estimateHotelRooms(rows, 4);
  assert.equal(est.totalPeople, 0);
  assert.equal(est.totalRooms, 0);
  assert.equal(est.zeroOccupancyHouseholds, 1);
  assert.equal(est.partialCount, 3); // 카운터는 유지 (안내 문구용)
});

test("부분참석자는 같은 가구 안에서도 정원에서 빠진다", () => {
  // 전일 3 + 부분 2 → 정원 3명 → 4인실 1방 (부분참석 포함이면 2방이 됐을 것)
  const rows = household("h1", 3, FOUR);
  rows.push(
    makeAttendee({ householder_id: "h1", attendance: "partial" }),
    makeAttendee({ householder_id: "h1", attendance: "partial" }),
  );
  const est = estimateHotelRooms(rows, 4);
  assert.equal(est.totalPeople, 3);
  assert.equal(est.totalRooms, 1);
  assert.equal(est.partialCount, 2);
});

test("가구에 연결되지 않은 행은 unlinkedAttendees로 드러난다", () => {
  const orphan = makeAttendee({ is_householder: false, householder_id: null });
  const est = estimateHotelRooms([orphan], 4);
  assert.equal(est.unlinkedAttendees, 1);
  assert.equal(est.totalRooms, 0);
});
