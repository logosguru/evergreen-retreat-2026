import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PARTIAL_FEE,
  CHILD_PARTIAL_FEE,
  CHILD_FULL_FEE,
  personFee,
  personBaseFee,
  hasFeeDiscount,
  applyFeeDiscount,
  FEE_DISCOUNT_PCT,
  groupHouseholds,
  withHouseholdRoomType,
  paidByAttendee,
  personShares,
  householdOccupancy,
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
    fee_waived: false,
    fee_discount_pct: 0,
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

test("회비 면제(강사 등)는 객실 타입을 골랐어도 $0", () => {
  assert.equal(
    personFee(makeAttendee({ fee_waived: true, requested_room_type: FOUR })),
    0,
  );
});

test("회비 면제가 부분 참석·6~12세보다 우선", () => {
  assert.equal(
    personFee(
      makeAttendee({
        fee_waived: true,
        attendance: "partial",
        is_child_6_12: true,
      }),
    ),
    0,
  );
});

test("면제자는 타입 미선택이어도 미산정(null)이 아니다", () => {
  assert.equal(personFee(makeAttendee({ fee_waived: true })), 0);
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

test("방 합계: 면제자는 합계에서 빠지고 미산정으로도 세지 않는다", () => {
  // 강사 혼자인 방 — 객실 타입 미선택이어도 합계 0, 미산정 0명.
  const speaker = makeAttendee({
    is_householder: true,
    role: "speaker",
    fee_waived: true,
  });
  const [alone] = groupHouseholds(withHouseholdRoomType([speaker]));
  assert.equal(alone.total, 0);
  assert.equal(alone.unassignedCount, 0);

  // 일반 방에 면제자가 섞인 경우 — 면제자 몫만 빠진다.
  const head = makeAttendee({
    is_householder: true,
    requested_room_type: FOUR,
  });
  const [mixed] = groupHouseholds(
    withHouseholdRoomType([
      head,
      makeAttendee({ householder_id: head.id }), // 전참 → 200
      makeAttendee({ householder_id: head.id, fee_waived: true }), // → 0
    ]),
  );
  assert.equal(mixed.total, 200 + 200);
  assert.equal(mixed.unassignedCount, 0);
});

test("회비 지원 50%: 4인실 $200 → $100", () => {
  const a = makeAttendee({
    requested_room_type: FOUR,
    fee_discount_pct: FEE_DISCOUNT_PCT,
  });
  assert.equal(FEE_DISCOUNT_PCT, 50);
  assert.equal(personBaseFee(a), 200);
  assert.equal(personFee(a), 100);
  assert.equal(hasFeeDiscount(a), true);
});

test("회비 지원은 정액 회비(부분 참석·6~12세)에도 적용", () => {
  assert.equal(
    personFee(makeAttendee({ attendance: "partial", fee_discount_pct: 50 })),
    50,
  );
  assert.equal(
    personFee(
      makeAttendee({ is_child_6_12: true, fee_discount_pct: 50 }),
    ),
    50,
  );
  // 6~12세 부분 $50 의 절반 = $25 (홀수 금액 반올림 없음)
  assert.equal(
    personFee(
      makeAttendee({
        is_child_6_12: true,
        attendance: "partial",
        fee_discount_pct: 50,
      }),
    ),
    25,
  );
});

test("회비 지원 + 타입 미선택은 여전히 미산정(null)", () => {
  assert.equal(personFee(makeAttendee({ fee_discount_pct: 50 })), null);
});

test("면제·6세 미만이 지원보다 우선이고 배지도 안 뜬다", () => {
  const waived = makeAttendee({
    fee_waived: true,
    fee_discount_pct: 50,
    requested_room_type: FOUR,
  });
  assert.equal(personFee(waived), 0);
  assert.equal(hasFeeDiscount(waived), false);

  const baby = makeAttendee({ is_under_6: true, fee_discount_pct: 50 });
  assert.equal(personFee(baby), 0);
  assert.equal(hasFeeDiscount(baby), false);
});

test("applyFeeDiscount: 반올림(half-up) + 0~100 클램프", () => {
  assert.equal(applyFeeDiscount(125, 50), 63); // 62.5 → 63 (SQL round()와 동일)
  assert.equal(applyFeeDiscount(200, 0), 200);
  assert.equal(applyFeeDiscount(200, null), 200);
  assert.equal(applyFeeDiscount(200, 100), 0);
  assert.equal(applyFeeDiscount(200, 150), 0);
  assert.equal(applyFeeDiscount(200, -10), 200);
});

test("가구 합계: 지원받는 사람 몫만 감면된다", () => {
  const head = makeAttendee({
    is_householder: true,
    requested_room_type: FOUR,
  });
  const rows = [
    head, // 200
    makeAttendee({ householder_id: head.id, fee_discount_pct: 50 }), // → 100
    makeAttendee({ householder_id: head.id }), // 200
  ];
  const [h] = groupHouseholds(withHouseholdRoomType(rows));
  assert.equal(h.total, 200 + 100 + 200);
  assert.equal(h.unassignedCount, 0);
});

test("personShares: 개인 결제 금액도 감면가 기준", () => {
  const head = makeAttendee({
    is_householder: true,
    requested_room_type: FOUR,
    fee_discount_pct: 50,
  });
  const [share] = personShares(withHouseholdRoomType([head]), []);
  assert.equal(share.fee, 100);
  assert.equal(share.remaining, 100);
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

// ── householdOccupancy: 방(가구) 정원 대비 숙박 인원 ──

function household(people: AttendeeWithRoom[]) {
  const [head, ...members] = people;
  return groupHouseholds(
    withHouseholdRoomType([
      { ...head, is_householder: true },
      ...members.map((m) => ({ ...m, householder_id: head.id })),
    ]),
  )[0];
}

test("householdOccupancy: 4인실에 3명이면 정원 미달 + 빈자리 1", () => {
  const h = household([
    makeAttendee({ requested_room_type: FOUR }),
    makeAttendee(),
    makeAttendee(),
  ]);
  const occ = householdOccupancy(h);
  assert.equal(occ.occupants, 3);
  assert.equal(occ.capacity, 4);
  assert.equal(occ.openBeds, 1);
  assert.equal(occ.under, true);
  assert.equal(occ.over, false);
});

test("householdOccupancy: 정원을 채우면 미달 아님", () => {
  const h = household([
    makeAttendee({ requested_room_type: FOUR }),
    makeAttendee(),
    makeAttendee(),
    makeAttendee(),
  ]);
  const occ = householdOccupancy(h);
  assert.equal(occ.occupants, 4);
  assert.equal(occ.openBeds, 0);
  assert.equal(occ.under, false);
  assert.equal(occ.over, false);
});

test("householdOccupancy: 6세 미만·부분 참석은 정원에 안 잡힌다", () => {
  const h = household([
    makeAttendee({ requested_room_type: FOUR }),
    makeAttendee(),
    makeAttendee({ is_under_6: true }),
    makeAttendee({ attendance: "partial" }),
  ]);
  const occ = householdOccupancy(h);
  assert.equal(occ.occupants, 2); // 4명 중 2명만 숙박
  assert.equal(occ.openBeds, 2);
  assert.equal(occ.under, true);
});

test("householdOccupancy: 정원 초과는 over", () => {
  const TWO: RoomTypeLite = { name: "double", price_per_person: 300, capacity: 2 };
  const h = household([
    makeAttendee({ requested_room_type: TWO }),
    makeAttendee(),
    makeAttendee(),
  ]);
  const occ = householdOccupancy(h);
  assert.equal(occ.over, true);
  assert.equal(occ.under, false);
  assert.equal(occ.openBeds, 0);
});

test("householdOccupancy: 타입 미선택이면 미달 판정을 하지 않는다", () => {
  const h = household([makeAttendee(), makeAttendee()]);
  const occ = householdOccupancy(h);
  assert.equal(occ.capacity, null);
  assert.equal(occ.under, false);
  assert.equal(occ.over, false);
});
