import { test } from "node:test";
import assert from "node:assert/strict";
import { bilingual } from "./poster.ts";

// 포스터는 한국어·영어를 한 장에 담는다. 대부분 항목은 장소가 같아 한 번만 쓰면 되지만,
// by_language 항목(성경공부 등)은 언어별로 실제 장소·강사가 다르므로 둘 다 보여야 한다.

test("en 값이 없으면 한국어로 fallback 하고 same=true", () => {
  const item = { location: "로비", location_en: null, location_es: null };
  assert.deepEqual(bilingual(item, "location"), {
    ko: "로비",
    en: "로비",
    same: true,
  });
});

test("en 값이 같은 문자열이면 same=true", () => {
  const item = {
    location: "Gala Hall",
    location_en: "Gala Hall",
    location_es: "Gala Hall",
  };
  assert.deepEqual(bilingual(item, "location"), {
    ko: "Gala Hall",
    en: "Gala Hall",
    same: true,
  });
});

test("언어별로 장소가 다르면 same=false — 포스터가 둘 다 표기해야 한다", () => {
  const item = {
    location: "Conference Room",
    location_en: "Pacific Ballroom",
    location_es: "Pacific Ballroom",
  };
  assert.deepEqual(bilingual(item, "location"), {
    ko: "Conference Room",
    en: "Pacific Ballroom",
    same: false,
  });
});

test("강사(description)도 언어별로 다를 수 있다", () => {
  const item = {
    description: "정정원 목사 / 기도: 한호정 장로",
    description_en: "Missionary Vicky Park / Prayer: Deacon Oscar Osorio",
    description_es: null,
  };
  const r = bilingual(item, "description");
  assert.equal(r.same, false);
  assert.equal(r.ko, "정정원 목사 / 기도: 한호정 장로");
  assert.equal(r.en, "Missionary Vicky Park / Prayer: Deacon Oscar Osorio");
});

test("앞뒤 공백만 다른 값은 같은 것으로 본다", () => {
  const item = { location: "Gala Hall", location_en: "  Gala Hall  ", location_es: null };
  const r = bilingual(item, "location");
  assert.equal(r.same, true);
  assert.equal(r.en, "Gala Hall", "공백은 정리해서 반환");
});

test("양쪽 모두 비어 있으면 null", () => {
  const item = { location: null, location_en: null, location_es: null };
  assert.deepEqual(bilingual(item, "location"), { ko: null, en: null, same: true });
});

test("빈 문자열·공백 문자열은 값 없음으로 취급", () => {
  const item = { location: "   ", location_en: "", location_es: null };
  assert.deepEqual(bilingual(item, "location"), { ko: null, en: null, same: true });
});

test("한국어만 비어 있고 en 만 있으면 en 을 양쪽에 쓴다", () => {
  const item = { location: null, location_en: "Pacific Room", location_es: null };
  assert.deepEqual(bilingual(item, "location"), {
    ko: "Pacific Room",
    en: "Pacific Room",
    same: true,
  });
});
