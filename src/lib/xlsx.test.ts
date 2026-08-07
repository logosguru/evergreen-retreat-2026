import { test } from "node:test";
import assert from "node:assert/strict";
import { buildXlsx, columnLetter } from "./xlsx.ts";

test("columnLetter: A..Z 이후 두 글자로 넘어간다", () => {
  assert.equal(columnLetter(0), "A");
  assert.equal(columnLetter(25), "Z");
  assert.equal(columnLetter(26), "AA");
  assert.equal(columnLetter(27), "AB");
  assert.equal(columnLetter(51), "AZ");
  assert.equal(columnLetter(52), "BA");
});

function entryNames(zip: Uint8Array): string[] {
  // 로컬 파일 헤더(PK\x03\x04)를 훑어 파일명만 수집.
  const names: string[] = [];
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let at = 0;
  while (at + 4 <= zip.length && view.getUint32(at, true) === 0x04034b50) {
    const size = view.getUint32(at + 18, true);
    const nameLen = view.getUint16(at + 26, true);
    const extraLen = view.getUint16(at + 28, true);
    names.push(
      new TextDecoder().decode(zip.subarray(at + 30, at + 30 + nameLen)),
    );
    at += 30 + nameLen + extraLen + size;
  }
  return names;
}

test("buildXlsx: 필수 OOXML 파트를 모두 담은 ZIP을 만든다", () => {
  const out = buildXlsx([
    { name: "Sheet1", columns: [{ header: "A" }], rows: [["x"]] },
    { name: "Sheet2", columns: [{ header: "B" }], rows: [[1]] },
  ]);
  assert.deepEqual(entryNames(out), [
    "[Content_Types].xml",
    "_rels/.rels",
    "xl/workbook.xml",
    "xl/_rels/workbook.xml.rels",
    "xl/styles.xml",
    "xl/worksheets/sheet1.xml",
    "xl/worksheets/sheet2.xml",
  ]);
  // EOCD 시그니처로 끝나야 한다.
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  assert.equal(view.getUint32(out.length - 22, true), 0x06054b50);
});

test("buildXlsx: XML 특수문자와 제어문자를 안전하게 처리한다", () => {
  const out = buildXlsx([
    {
      name: "t",
      columns: [{ header: "h" }],
      rows: [["a & b <c>"], ["null\u0000byte"]],
    },
  ]);
  const xml = new TextDecoder().decode(out);
  assert.ok(xml.includes("a &amp; b &lt;c&gt;"));
  assert.ok(xml.includes("nullbyte"));
  // ZIP 헤더에 0바이트가 있으므로 "원본 문자열 그대로 남았는지"로 확인한다.
  assert.ok(!xml.includes("null\u0000byte"));
});

test("buildXlsx: 시트명을 31자·금지문자·중복 규칙에 맞춘다", () => {
  const out = buildXlsx([
    { name: "a/b:c", columns: [{ header: "h" }], rows: [] },
    { name: "a b c", columns: [{ header: "h" }], rows: [] },
    { name: "x".repeat(40), columns: [{ header: "h" }], rows: [] },
  ]);
  const xml = new TextDecoder().decode(out);
  assert.ok(xml.includes('name="a b c"'));
  assert.ok(xml.includes('name="a b c (2)"'));
  assert.ok(xml.includes(`name="${"x".repeat(31)}"`));
});

test("buildXlsx: 빈 시트 목록은 거부한다", () => {
  assert.throws(() => buildXlsx([]), /시트가 최소 1개/);
});
