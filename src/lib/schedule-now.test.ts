import { test } from "node:test";
import assert from "node:assert/strict";
import { etWallClock, findNowNext, NOW_MAX_MINUTES } from "./schedule-now.ts";

type Item = { id: string; day: string; start_time: string };

// 수련회 2026-09-05(토) ~ 09-07(월) 축약 일정
const items: Item[] = [
  { id: "a", day: "2026-09-05", start_time: "15:00:00" },
  { id: "b", day: "2026-09-05", start_time: "19:30:00" },
  { id: "c", day: "2026-09-05", start_time: "21:30:00" },
  { id: "d", day: "2026-09-06", start_time: "07:00:00" },
  { id: "e", day: "2026-09-06", start_time: "09:00:00" },
  { id: "f", day: "2026-09-07", start_time: "10:00:00" },
];

test("수련회 기간 전에는 아무것도 표시하지 않는다", () => {
  assert.deepEqual(findNowNext(items, { day: "2026-08-28", time: "10:00" }), {
    nowIds: [],
    nextIds: [],
  });
});

test("수련회 기간 후에는 아무것도 표시하지 않는다", () => {
  assert.deepEqual(findNowNext(items, { day: "2026-09-08", time: "10:00" }), {
    nowIds: [],
    nextIds: [],
  });
});

test("첫날 첫 순서 전이면 '지금'은 없고 첫 순서가 '다음'", () => {
  assert.deepEqual(findNowNext(items, { day: "2026-09-05", time: "09:00" }), {
    nowIds: [],
    nextIds: ["a"],
  });
});

test("순서 시작 정각에는 그 순서가 '지금'", () => {
  assert.deepEqual(findNowNext(items, { day: "2026-09-05", time: "15:00" }), {
    nowIds: ["a"],
    nextIds: ["b"],
  });
});

test("순서 사이에는 시작한 순서가 '지금', 그 뒤가 '다음'", () => {
  assert.deepEqual(findNowNext(items, { day: "2026-09-05", time: "20:15" }), {
    nowIds: ["b"],
    nextIds: ["c"],
  });
});

test("마지막 순서 후 오래 지났으면 '지금'은 사라지고 '다음'만 남는다", () => {
  // 21:30 + 3시간 = 00:30 → 새벽 2시엔 '지금' 없음, 다음날 첫 순서가 '다음'
  assert.deepEqual(findNowNext(items, { day: "2026-09-06", time: "02:00" }), {
    nowIds: [],
    nextIds: ["d"],
  });
});

test("직전 순서 시작 후 NOW_MAX_MINUTES 이내면 아직 '지금'", () => {
  assert.equal(NOW_MAX_MINUTES, 180);
  assert.deepEqual(findNowNext(items, { day: "2026-09-06", time: "00:00" }), {
    nowIds: ["c"],
    nextIds: ["d"],
  });
});

test("전체 마지막 순서 후 오래 지나면 둘 다 없다", () => {
  assert.deepEqual(findNowNext(items, { day: "2026-09-07", time: "16:00" }), {
    nowIds: [],
    nextIds: [],
  });
});

test("같은 시각 순서가 여러 개면 모두 '지금' / 모두 '다음'", () => {
  const tied: Item[] = [
    { id: "x", day: "2026-09-06", start_time: "09:00:00" },
    { id: "y", day: "2026-09-06", start_time: "09:00:00" },
    { id: "z", day: "2026-09-06", start_time: "11:00:00" },
    { id: "w", day: "2026-09-06", start_time: "11:00:00" },
  ];
  assert.deepEqual(findNowNext(tied, { day: "2026-09-06", time: "09:30" }), {
    nowIds: ["x", "y"],
    nextIds: ["z", "w"],
  });
});

test("빈 목록도 안전하다", () => {
  assert.deepEqual(findNowNext([], { day: "2026-09-06", time: "09:30" }), {
    nowIds: [],
    nextIds: [],
  });
});

test("정렬이 흐트러진 입력도 시작 시각 기준으로 판정한다", () => {
  const shuffled = [items[3], items[0], items[5], items[2], items[1], items[4]];
  assert.deepEqual(findNowNext(shuffled, { day: "2026-09-05", time: "20:15" }), {
    nowIds: ["b"],
    nextIds: ["c"],
  });
});

test("etWallClock: UTC 시각을 뉴욕 현지 벽시계로 변환 (여름 -4h)", () => {
  // 2026-09-05T23:45:00Z = 뉴욕 19:45 EDT
  assert.deepEqual(etWallClock(new Date("2026-09-05T23:45:00Z")), {
    day: "2026-09-05",
    time: "19:45",
  });
});

test("etWallClock: UTC 자정을 넘으면 뉴욕 날짜는 전날", () => {
  // 2026-09-06T01:30:00Z = 뉴욕 2026-09-05 21:30 EDT
  assert.deepEqual(etWallClock(new Date("2026-09-06T01:30:00Z")), {
    day: "2026-09-05",
    time: "21:30",
  });
});

test("etWallClock: 뉴욕 자정은 00:00 (24:00 아님)", () => {
  // 2026-09-06T04:00:00Z = 뉴욕 2026-09-06 00:00 EDT
  assert.deepEqual(etWallClock(new Date("2026-09-06T04:00:00Z")), {
    day: "2026-09-06",
    time: "00:00",
  });
});
