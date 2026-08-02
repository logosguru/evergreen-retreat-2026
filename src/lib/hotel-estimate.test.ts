import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateHotelRooms } from "./hotel-estimate.ts";

test("빈 명단이면 방 0개", () => {
  const est = estimateHotelRooms([], 4);
  assert.equal(est.totalRooms, 0);
  assert.equal(est.assumed, null);
  assert.deepEqual(est.decided, []);
});
