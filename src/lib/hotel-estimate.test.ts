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

test("householdOccupants: 6세 미만은 정원 집계에서 제외", () => {
  const head = makeAttendee({ id: "h1", is_householder: true });
  const adult = makeAttendee({ householder_id: "h1" });
  const baby = makeAttendee({ householder_id: "h1", is_under_6: true });
  const [hh] = groupHouseholds([head, adult, baby]);
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
