// 의존성 없는 최소 XLSX(Office Open XML) 작성기.
// - ZIP은 무압축(store) — 참석자 명단 규모(수백 행)에선 크기 차이가 무의미하고,
//   deflate 구현 없이 Excel/Numbers/Google Sheets가 여는 정식 .xlsx가 나온다.
// - 문자열은 sharedStrings 없이 inlineStr로 써서 파트 수를 줄인다.

export type CellValue = string | number | boolean | null | undefined;

export interface XlsxColumn {
  header: string;
  width?: number; // 미지정 시 내용 기준 자동 산정
  money?: boolean; // 숫자를 $#,##0 서식으로
}

export interface XlsxSheet {
  name: string;
  columns: XlsxColumn[];
  rows: CellValue[][];
}

// ── ZIP (store) ───────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

// 결정적(deterministic) 출력을 위해 타임스탬프는 DOS epoch(1980-01-01)로 고정.
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

function zipStore(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const crc = crc32(e.data);
    const size = e.data.length;

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 파일명
    lv.setUint16(8, 0, true); // 압축 없음
    lv.setUint16(10, DOS_TIME, true);
    lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra 없음
    local.set(nameBytes, 30);
    locals.push(local, e.data);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); // central directory header
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, DOS_TIME, true);
    cv.setUint16(14, DOS_DATE, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true); // 로컬 헤더 offset
    central.set(nameBytes, 46);
    centrals.push(central);

    offset += local.length + size;
  }

  const cdSize = centrals.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // end of central directory
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  return concat([...locals, ...centrals, eocd]);
}

// ── XML 조립 ──────────────────────────────────────────────────

// XML 1.0이 허용하지 않는 제어문자는 제거(파일 손상 방지) 후 이스케이프.
function esc(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 0-based 인덱스 → A, B, …, Z, AA, AB …
export function columnLetter(index: number): string {
  let s = "";
  let n = index;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

// 열 너비 산정용 표시폭: CJK/전각은 2칸으로 센다.
function visualWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    w +=
      (c >= 0x1100 && c <= 0x115f) ||
      (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xff00 && c <= 0xff60)
        ? 2
        : 1;
  }
  return w;
}

function cellXml(ref: string, v: CellValue, styleId: number): string {
  if (v == null || v === "") return "";
  const s = styleId ? ` s="${styleId}"` : "";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    return `<c r="${ref}"${s}><v>${v}</v></c>`;
  }
  if (typeof v === "boolean") {
    return `<c r="${ref}"${s} t="b"><v>${v ? 1 : 0}</v></c>`;
  }
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

const HEADER_STYLE = 1;
const MONEY_STYLE = 2;

function sheetXml(sheet: XlsxSheet): string {
  const cols = sheet.columns;
  const lastCol = columnLetter(Math.max(cols.length - 1, 0));
  const lastRow = sheet.rows.length + 1;

  const colsXml = cols
    .map((c, i) => {
      const auto = Math.max(
        visualWidth(c.header),
        ...sheet.rows.map((r) => visualWidth(r[i] == null ? "" : String(r[i]))),
      );
      const w = c.width ?? Math.min(Math.max(auto + 2, 6), 40);
      return `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
    })
    .join("");

  const headerXml = cols
    .map((c, i) => cellXml(`${columnLetter(i)}1`, c.header, HEADER_STYLE))
    .join("");

  const rowsXml = sheet.rows
    .map((row, r) => {
      const n = r + 2;
      const cells = cols
        .map((c, i) => {
          const v = row[i];
          const style = c.money && typeof v === "number" ? MONEY_STYLE : 0;
          return cellXml(`${columnLetter(i)}${n}`, v, style);
        })
        .join("");
      return `<row r="${n}">${cells}</row>`;
    })
    .join("");

  // 요소 순서(dimension → sheetViews → cols → sheetData → autoFilter)는 스키마상 고정.
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<dimension ref="A1:${lastCol}${Math.max(lastRow, 1)}"/>` +
    `<sheetViews><sheetView workbookViewId="0">` +
    `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` +
    `</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    `<cols>${colsXml}</cols>` +
    `<sheetData><row r="1">${headerXml}</row>${rowsXml}</sheetData>` +
    `<autoFilter ref="A1:${lastCol}${Math.max(lastRow, 1)}"/>` +
    `</worksheet>`
  );
}

const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0"/></numFmts>` +
  `<fonts count="2">` +
  `<font><sz val="11"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
  `</fonts>` +
  // Excel은 fill 0=none, 1=gray125 두 개를 항상 기대한다.
  `<fills count="2">` +
  `<fill><patternFill patternType="none"/></fill>` +
  `<fill><patternFill patternType="gray125"/></fill>` +
  `</fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="3">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

// 시트명 제약: 31자 이하, []:*?/\ 금지, 중복 불가.
function sheetName(raw: string, index: number, used: Set<string>): string {
  let name = raw.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31);
  if (!name) name = `Sheet${index + 1}`;
  let candidate = name;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${n++})`;
    candidate = name.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export function buildXlsx(sheets: XlsxSheet[]): Uint8Array {
  if (sheets.length === 0) throw new Error("buildXlsx: 시트가 최소 1개 필요합니다");
  const enc = new TextEncoder();
  const used = new Set<string>();
  const names = sheets.map((s, i) => sheetName(s.name, i, used));

  const sheetTags = names
    .map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("");
  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"` +
    ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>${sheetTags}</sheets></workbook>`;

  const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const sheetRels = names
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join("");
  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sheetRels +
    `<Relationship Id="rId${names.length + 1}" Type="${REL}/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const CT = "application/vnd.openxmlformats-officedocument.spreadsheetml";
  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="${CT}.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="${CT}.styles+xml"/>` +
    names
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${CT}.worksheet+xml"/>`,
      )
      .join("") +
    `</Types>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: enc.encode(contentTypes) },
    { name: "_rels/.rels", data: enc.encode(rootRels) },
    { name: "xl/workbook.xml", data: enc.encode(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(workbookRels) },
    { name: "xl/styles.xml", data: enc.encode(STYLES_XML) },
    ...sheets.map((s, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: enc.encode(sheetXml(s)),
    })),
  ];

  return zipStore(entries);
}
