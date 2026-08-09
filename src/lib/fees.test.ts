import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PARTIAL_FEE,
  CHILD_PARTIAL_FEE,
  CHILD_FULL_FEE,
  personFee,
  groupHouseholds,
  withHouseholdRoomType,
  paidByAttendee,
  personShares,
  type AttendeeWithRoom,
  type RoomTypeLite,
} from "./fees.ts";

let seq = 0;

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

const FOUR: RoomTypeLite = {
  name: "quad",
  price_per_person: 200,
  capacity: 4,
};

test("전참 + 타입 선택 = 타입 단가", () => {
  assert.equal(
    personFee(makeAttendee({ requested_room_type: FOUR })),
    200,
  );
});

test("전참 + 타입 미선택 = null(미산정)", () => {
  assert.equal(personFee(makeAttendee()), null);
});

test("부분 참석 = 타입 미선택이어도 1인 $100", () => {
  assert.equal(personFee(makeAttendee({ attendance: "partial" })), PARTIAL_FEE);
  assert.equal(PARTIAL_FEE, 100);
});

test("부분 참석 = 객실 타입을 골랐어도 단가 무시하고 $100", () => {
  assert.equal(
    personFee(
      makeAttendee({ attendance: "partial", requested_room_type: FOUR }),
    ),
    PARTIAL_FEE,
  );
});

test("6세 미만은 부분 참석이어도 면제", () => {
  assert.equal(
    personFee(makeAttendee({ attendance: "partial", is_under_6: true })),
    0,
  );
});

test("6~12세 부분 참석 = $50", () => {
  assert.equal(
    personFee(makeAttendee({ attendance: "partial", is_child_6_12: true })),
    CHILD_PARTIAL_FEE,
  );
  assert.equal(CHILD_PARTIAL_FEE, 50);
});

test("6~12세 전일 참석 = 객실 타입과 무관하게 $100", () => {
  assert.equal(
    personFee(
      makeAttendee({
        attendance: "full",
        is_child_6_12: true,
        requested_room_type: FOUR,
      }),
    ),
    CHILD_FULL_FEE,
  );
  assert.equal(CHILD_FULL_FEE, 100);
});

test("6~12세 전일 참석은 타입 미선택이어도 $100(미산정 아님)", () => {
  assert.equal(
    personFee(makeAttendee({ attendance: "full", is_child_6_12: true })),
    CHILD_FULL_FEE,
  );
});

test("6세 미만 플래그가 6~12세보다 우선(면제)", () => {
  assert.equal(
    personFee(
      makeAttendee({
        attendance: "full",
        is_under_6: true,
        is_child_6_12: true,
      }),
    ),
    0,
  );
});

test("가구 합계: 전참/부분 혼합은 사람별로 계산", () => {
  const head = makeAttendee({
    is_householder: true,
    requested_room_type: FOUR,
  });
  const rows = [
    head,
    makeAttendee({ householder_id: head.id }), // 전참 → 200
    makeAttendee({ householder_id: head.id, attendance: "partial" }), // → 100
    makeAttendee({ householder_id: head.id, is_child_6_12: true }), // 전일 아이 → 100
    makeAttendee({
      householder_id: head.id,
      attendance: "partial",
      is_child_6_12: true,
    }), // 부분 아이 → 50
    makeAttendee({ householder_id: head.id, is_under_6: true }), // → 0
  ];
  const [h] = groupHouseholds(withHouseholdRoomType(rows));
  assert.equal(h.total, 200 + 200 + 100 + 100 + 50 + 0);
  assert.equal(h.unassignedCount, 0);
});

test("가구 합계: 타입 미선택 부분 참석 가구는 미산정이 아니라 인원×$100", () => {
  const head = makeAttendee({ is_householder: true, attendance: "partial" });
  const rows = [
    head,
    makeAttendee({ householder_id: head.id, attendance: "partial" }),
  ];
  const [h] = groupHouseholds(withHouseholdRoomType(rows));
  assert.equal(h.total, 200);
  assert.equal(h.unassignedCount, 0);
});

test("paidByAttendee는 가구 전체(attendee_id=null) 납입을 개인에 귀속시키지 않는다", () => {
  const m = paidByAttendee([
    { attendee_id: "a", amount: 200 },
    { attendee_id: "a", amount: -50 },
    { attendee_id: "b", amount: 200 },
    { attendee_id: null, amount: 600 },
  ]);
  assert.equal(m.get("a"), 150);
  assert.equal(m.get("b"), 200);
  assert.equal(m.size, 2);
});

test("personShares는 각자 몫에서 본인 납입만 차감한다", () => {
  const p1 = makeAttendee({ id: "p1", requested_room_type: FOUR });
  const p2 = makeAttendee({ id: "p2", requested_room_type: FOUR });
  const baby = makeAttendee({ id: "baby", is_under_6: true });
  const noType = makeAttendee({ id: "nt" }); // 타입 미선택 → 미산정

  const shares = personShares(
    [p1, p2, baby, noType],
    [
      { attendee_id: "p1", amount: 200 },
      { attendee_id: "p2", amount: 50 },
      { attendee_id: null, amount: 100 },
    ],
  );
  const by = new Map(shares.map((s) => [s.person.id, s]));
  assert.equal(by.get("p1")!.remaining, 0);
  assert.equal(by.get("p2")!.remaining, 150);
  assert.equal(by.get("baby")!.remaining, 0);
  assert.equal(by.get("nt")!.fee, null);
  assert.equal(by.get("nt")!.remaining, 0);
});
