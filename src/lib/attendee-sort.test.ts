import { test } from "node:test";
import assert from "node:assert/strict";
import { sortAttendees, sortHouseholds } from "./attendee-sort.ts";
import { groupHouseholds, type AttendeeWithRoom } from "./fees.ts";

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

const ids = (rows: AttendeeWithRoom[]) => rows.map((r) => r.id);

test("이름 정렬: asc/desc 토글", () => {
  const rows = [
    makeAttendee({ id: "b", korean_name: "나" }),
    makeAttendee({ id: "a", korean_name: "가" }),
    makeAttendee({ id: "c", korean_name: "다" }),
  ];
  assert.deepEqual(ids(sortAttendees(rows, { key: "name", dir: "asc" })), [
    "a",
    "b",
    "c",
  ]);
  assert.deepEqual(ids(sortAttendees(rows, { key: "name", dir: "desc" })), [
    "c",
    "b",
    "a",
  ]);
});

test("직분 정렬: 알파벳순이 아니라 ROLES 선언 순서(교역자→장로→…)", () => {
  const rows = [
    makeAttendee({ id: "m", role: "member" }),
    makeAttendee({ id: "p", role: "pastor" }),
    makeAttendee({ id: "e", role: "elder" }),
  ];
  assert.deepEqual(ids(sortAttendees(rows, { key: "role", dir: "asc" })), [
    "p",
    "e",
    "m",
  ]);
});

test("구역 정렬: 숫자 구역이 문자열 구역보다 앞(DISTRICTS 순서)", () => {
  const rows = [
    makeAttendee({ id: "mah", district: "mahanaim" }),
    makeAttendee({ id: "d10", district: "9" }),
    makeAttendee({ id: "d2", district: "2" }),
  ];
  assert.deepEqual(ids(sortAttendees(rows, { key: "district", dir: "asc" })), [
    "d2",
    "d10",
    "mah",
  ]);
});

test("빈 값(구역·차량·방 미지정)은 방향과 무관하게 항상 맨 뒤", () => {
  const rows = [
    makeAttendee({ id: "none", district: null }),
    makeAttendee({ id: "d1", district: "1" }),
    makeAttendee({ id: "d3", district: "3" }),
  ];
  for (const dir of ["asc", "desc"] as const) {
    const out = ids(sortAttendees(rows, { key: "district", dir }));
    assert.equal(out.at(-1), "none", `dir=${dir}`);
  }
});

test("차량 정렬: PICKUP_LOCATIONS 순서 + 미지정 뒤", () => {
  const rows = [
    makeAttendee({ id: "li", pickup_location: "long_island" }),
    makeAttendee({ id: "no", pickup_location: null }),
    makeAttendee({ id: "man", pickup_location: "manhattan" }),
  ];
  assert.deepEqual(ids(sortAttendees(rows, { key: "pickup", dir: "asc" })), [
    "man",
    "li",
    "no",
  ]);
});

test("티셔츠 정렬: 사이즈 선언 순서(XXXS→XXXL) + 미지정 뒤", () => {
  const rows = [
    makeAttendee({ id: "xl", tshirt_size: "xl" }),
    makeAttendee({ id: "none", tshirt_size: null }),
    makeAttendee({ id: "xxxs", tshirt_size: "xxxs" }),
    makeAttendee({ id: "m", tshirt_size: "m" }),
  ];
  assert.deepEqual(ids(sortAttendees(rows, { key: "tshirt", dir: "asc" })), [
    "xxxs",
    "m",
    "xl",
    "none",
  ]);
  // 방향을 뒤집어도 미지정은 항상 맨 뒤
  assert.equal(
    ids(sortAttendees(rows, { key: "tshirt", dir: "desc" })).at(-1),
    "none",
  );
});

test("회비 정렬: 6세미만/미산정은 0으로 취급", () => {
  const cheap = { name: "4인실", price_per_person: 200, capacity: 4 };
  const pricey = { name: "2인실", price_per_person: 300, capacity: 2 };
  const rows = [
    makeAttendee({ id: "hi", requested_room_type: pricey }),
    makeAttendee({ id: "zero", is_under_6: true }),
    makeAttendee({ id: "lo", requested_room_type: cheap }),
  ];
  assert.deepEqual(ids(sortAttendees(rows, { key: "fee", dir: "desc" })), [
    "hi",
    "lo",
    "zero",
  ]);
});

test("가구 정렬: 방향과 무관하게 가구주가 가구원보다 먼저", () => {
  const rows = [
    makeAttendee({ id: "kid", korean_name: "김아들", householder_id: "dad" }),
    makeAttendee({ id: "dad", korean_name: "김아빠", is_householder: true }),
    makeAttendee({ id: "solo", korean_name: "박혼자", is_householder: true }),
  ];
  assert.deepEqual(ids(sortAttendees(rows, { key: "household", dir: "asc" })), [
    "dad",
    "kid",
    "solo",
  ]);
  assert.deepEqual(ids(sortAttendees(rows, { key: "household", dir: "desc" })), [
    "solo",
    "dad",
    "kid",
  ]);
});

test("가구별 보기: 기본은 가구 구성원 중 최신 등록일 순", () => {
  const oldHead = makeAttendee({
    id: "old",
    is_householder: true,
    created_at: "2026-01-01T00:00:00Z",
  });
  const oldKid = makeAttendee({
    householder_id: "old",
    created_at: "2026-07-01T00:00:00Z", // 가족 중 한 명이 최근 등록
  });
  const newHead = makeAttendee({
    id: "new",
    is_householder: true,
    created_at: "2026-05-01T00:00:00Z",
  });
  const hs = sortHouseholds(
    groupHouseholds([oldHead, oldKid, newHead]),
    { key: "registered", dir: "desc" },
  );
  assert.deepEqual(
    hs.map((h) => h.head.id),
    ["old", "new"],
  );
});

test("가구별 보기: 회비 합계 정렬", () => {
  const type = { name: "2인실", price_per_person: 300, capacity: 2 };
  const rich = makeAttendee({
    id: "rich",
    is_householder: true,
    requested_room_type: type,
  });
  const richKid = makeAttendee({
    householder_id: "rich",
    requested_room_type: type,
  });
  const poor = makeAttendee({
    id: "poor",
    is_householder: true,
    requested_room_type: type,
  });
  const hs = sortHouseholds(groupHouseholds([rich, richKid, poor]), {
    key: "fee",
    dir: "desc",
  });
  assert.deepEqual(
    hs.map((h) => h.head.id),
    ["rich", "poor"],
  );
});
