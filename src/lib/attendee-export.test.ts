import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAttendeeSheet,
  buildPaymentSheet,
  type ExportLabels,
} from "./attendee-export.ts";
import type { AttendeeWithRoom } from "./fees.ts";
import type { FeePayment } from "./types.ts";

// 라벨은 토큰 그대로 돌려주는 아이덴티티로 두고 값 로직만 검증.
const id = (s: string) => s;
const L: ExportLabels = {
  sheetAttendees: "참석자",
  sheetPayments: "납입 내역",
  h: {
    no: "번호",
    koreanName: "한글 이름",
    englishName: "영어 이름",
    household: "가구",
    isHead: "가구주",
    householdSize: "가구 인원",
    district: "구역",
    role: "직분",
    gender: "성별",
    under6: "6세 미만",
    child612: "6~12세",
    language: "언어",
    attendance: "참석",
    arrival: "도착일",
    departure: "출발일",
    pickup: "차량",
    email: "이메일",
    phone: "연락처",
    roomType: "객실 타입",
    room: "방",
    retreatGroup: "수련회조",
    groupLeader: "조장",
    personFee: "1인 회비",
    householdTotal: "가구 회비",
    paidTotal: "납입 합계",
    balance: "잔액",
    status: "정산 상태",
    methods: "납부 수단",
    note: "요청사항",
    registered: "등록일",
  },
  p: {
    head: "가구주",
    district: "구역",
    payer: "납부 대상",
    date: "날짜",
    amount: "금액",
    method: "수단",
    note: "메모",
    recordedAt: "기록 시각",
  },
  role: id,
  district: id,
  gender: id,
  attendance: id,
  language: id,
  pickup: id,
  method: id,
  yes: "예",
  no: "아니오",
  feeExempt: "면제",
  feePending: "미산정",
  roomUnassigned: "미배정",
  statusSettled: "정산 완료",
  statusOwe: "미납",
  statusRefund: "환불 필요",
  statusNoFee: "회비 미산정",
  payerHousehold: "가구 전체",
};

const TYPE_3 = { name: "3인실", price_per_person: 250, capacity: 3 };

function person(over: Partial<AttendeeWithRoom> & { id: string }): AttendeeWithRoom {
  return {
    korean_name: null,
    english_name: null,
    district: null,
    gender: null,
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
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    rooms: null,
    requested_room_type: null,
    ...over,
  } as AttendeeWithRoom;
}

// 3인 가구(성인2 + 6세미만1), 회비 500, 납입 300 → 잔액 200
function household(): AttendeeWithRoom[] {
  return [
    person({
      id: "head",
      korean_name: "김가장",
      district: "3",
      is_householder: true,
      requested_room_type: TYPE_3,
      rooms: { label: "201", room_types: TYPE_3 },
    }),
    person({
      id: "spouse",
      korean_name: "이배우",
      district: "3",
      householder_id: "head",
      requested_room_type: TYPE_3,
      created_at: "2026-01-02T00:00:00Z",
    }),
    person({
      id: "baby",
      korean_name: "아기",
      district: "3",
      householder_id: "head",
      is_under_6: true,
      requested_room_type: TYPE_3,
      created_at: "2026-01-03T00:00:00Z",
    }),
  ];
}

const PAYMENTS: FeePayment[] = [
  {
    id: "p1",
    head_id: "head",
    attendee_id: null,
    amount: 300,
    method: "paypal",
    note: null,
    paid_at: "2026-07-01",
    created_at: "2026-07-01T10:00:00Z",
  },
];

test("사람당 1행 평면 리스트를 만든다", () => {
  const sheet = buildAttendeeSheet(
    { attendees: household(), payments: PAYMENTS },
    L,
  );
  assert.equal(sheet.rows.length, 3);
  assert.equal(sheet.rows[0].length, sheet.columns.length);
  assert.deepEqual(
    sheet.rows.map((r) => r[1]),
    ["김가장", "이배우", "아기"], // 가구주 먼저, 이후 등록순
  );
});

test("앞쪽 열 순서는 가구주 → 이름 → 정산/금액 → 객실 타입 → 구역 → 직분", () => {
  const sheet = buildAttendeeSheet(
    { attendees: household(), payments: PAYMENTS },
    L,
  );
  assert.deepEqual(
    sheet.columns.slice(0, 11).map((c) => c.header),
    [
      "가구",
      "한글 이름",
      "영어 이름",
      "정산 상태",
      "가구 회비",
      "납입 합계",
      "잔액",
      "1인 회비",
      "객실 타입",
      "구역",
      "직분",
    ],
  );
  assert.deepEqual(sheet.rows[0].slice(0, 11), [
    "김가장",
    "김가장",
    "",
    "미납",
    500,
    300,
    200,
    250,
    "3인실",
    "3",
    "member",
  ]);
});

test("가구 단위 금액은 가구주 행에만, 정산 상태는 전 행에 채운다", () => {
  const sheet = buildAttendeeSheet(
    { attendees: household(), payments: PAYMENTS },
    L,
  );
  const col = (name: string) => sheet.columns.findIndex((c) => c.header === name);
  const total = col("가구 회비");
  const paid = col("납입 합계");
  const bal = col("잔액");
  const status = col("정산 상태");
  const methods = col("납부 수단");

  assert.deepEqual(
    [sheet.rows[0][total], sheet.rows[0][paid], sheet.rows[0][bal]],
    [500, 300, 200],
  );
  // 가구원 행은 비어 있어야 합계 열이 중복 합산되지 않는다.
  assert.deepEqual(
    [sheet.rows[1][total], sheet.rows[1][paid], sheet.rows[1][bal]],
    ["", "", ""],
  );
  assert.deepEqual(
    sheet.rows.map((r) => r[status]),
    ["미납", "미납", "미납"],
  );
  assert.deepEqual(
    sheet.rows.map((r) => r[methods]),
    ["paypal", "paypal", "paypal"],
  );
});

test("1인 회비: 6세 미만은 면제, 타입 미선택은 미산정", () => {
  const rows = household();
  const noType = person({ id: "solo", korean_name: "홍길동", is_householder: true });
  const sheet = buildAttendeeSheet(
    { attendees: [...rows, noType], payments: [] },
    L,
  );
  const fee = sheet.columns.findIndex((c) => c.header === "1인 회비");
  const byName = new Map(sheet.rows.map((r) => [r[1], r[fee]]));
  assert.equal(byName.get("김가장"), 250);
  assert.equal(byName.get("아기"), "면제");
  assert.equal(byName.get("홍길동"), "미산정");
});

test("납입 시트는 가구주 이름·구역·납부 대상을 붙인다", () => {
  const sheet = buildPaymentSheet(
    { attendees: household(), payments: PAYMENTS },
    L,
  );
  assert.deepEqual(sheet.rows, [
    ["김가장", "3", "가구 전체", "2026-07-01", 300, "paypal", "", "2026-07-01 10:00"],
  ]);
});

test("개인 납입은 대상 참석자 이름으로 표시한다", () => {
  const sheet = buildPaymentSheet(
    {
      attendees: household(),
      payments: [
        { ...PAYMENTS[0], id: "p2", attendee_id: "spouse", amount: 250 },
      ],
    },
    L,
  );
  assert.equal(sheet.rows[0][2], "이배우");
});

test("납입 기록이 없으면 정산 상태는 '회비 미산정'이 아니라 미납으로 나온다", () => {
  const sheet = buildAttendeeSheet({ attendees: household(), payments: [] }, L);
  const status = sheet.columns.findIndex((c) => c.header === "정산 상태");
  assert.equal(sheet.rows[0][status], "미납");

  // 회비도 납입도 0인 가구는 중립 표기.
  const solo = [person({ id: "solo", korean_name: "홍길동", is_householder: true })];
  const s2 = buildAttendeeSheet({ attendees: solo, payments: [] }, L);
  assert.equal(s2.rows[0][status], "회비 미산정");
});
