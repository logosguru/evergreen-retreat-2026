// node --test 로 직접 실행되므로 값 import 는 확장자(.ts) 필수.
import {
  DISTRICTS,
  LANGUAGES,
  PICKUP_LOCATIONS,
  ROLES,
  TSHIRT_SIZES,
} from "./types.ts";
import { personFee, type AttendeeWithRoom, type Household } from "./fees.ts";
import { nameKey } from "./names.ts";

// 관리자 참석자 표의 컬럼 정렬 키. (잔액 컬럼은 정렬 대상 아님)
export const SORT_KEYS = [
  "name",
  "household",
  "role",
  "district",
  "attendance",
  "room",
  "pickup",
  "language",
  "tshirt",
  "fee",
  "registered",
] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export interface SortState {
  key: SortKey | null;
  dir: "asc" | "desc";
}

// enum 토큰은 알파벳순이 아니라 선언 순서(직분 서열·구역 번호 등)로 정렬한다.
const indexOf = (list: readonly string[]) =>
  Object.fromEntries(list.map((v, i) => [v, i])) as Record<string, number>;
const LANG_INDEX = indexOf(LANGUAGES);
const ROLE_INDEX = indexOf(ROLES);
const DISTRICT_INDEX = indexOf(DISTRICTS);
const PICKUP_INDEX = indexOf(PICKUP_LOCATIONS);
const TSHIRT_INDEX = indexOf(TSHIRT_SIZES);

// 가구주 id → 가구주 행
export function buildHeads(
  rows: AttendeeWithRoom[],
): Map<string, AttendeeWithRoom> {
  const m = new Map<string, AttendeeWithRoom>();
  for (const r of rows) if (r.is_householder) m.set(r.id, r);
  return m;
}

// 행의 가구주(본인이 가구주면 본인). 못 찾으면 undefined.
export function headOf(
  a: AttendeeWithRoom,
  heads: Map<string, AttendeeWithRoom>,
): AttendeeWithRoom | undefined {
  const id = a.is_householder ? a.id : a.householder_id;
  return id ? heads.get(id) : undefined;
}

const nm = (a: AttendeeWithRoom) => nameKey(a);

// 기본(묶음): [가구주이름, 가구주먼저, created_at]
function compareDefault(
  a: AttendeeWithRoom,
  b: AttendeeWithRoom,
  heads: Map<string, AttendeeWithRoom>,
): number {
  const ha = nameKey(headOf(a, heads) ?? a);
  const hb = nameKey(headOf(b, heads) ?? b);
  return (
    ha.localeCompare(hb) ||
    Number(b.is_householder) - Number(a.is_householder) ||
    a.created_at.localeCompare(b.created_at)
  );
}

// 값이 비어 있는 행(미배정·미지정)은 정렬 방향과 무관하게 항상 맨 뒤.
function isMissing(a: AttendeeWithRoom, key: SortKey): boolean {
  if (key === "room") return a.rooms?.room_types?.name == null;
  if (key === "role") return a.role == null;
  if (key === "district") return a.district == null;
  if (key === "pickup") return a.pickup_location == null;
  if (key === "tshirt") return a.tshirt_size == null;
  return false;
}

// 활성 키 asc 비교(빈 값 처리는 sortAttendees에서 별도). tiebreak=이름.
function compareKey(
  a: AttendeeWithRoom,
  b: AttendeeWithRoom,
  key: SortKey,
): number {
  const byName = () => nm(a).localeCompare(nm(b));
  const byIndex = (
    idx: Record<string, number>,
    va?: string | null,
    vb?: string | null,
  ) => (idx[va ?? ""] ?? 99) - (idx[vb ?? ""] ?? 99) || byName();

  switch (key) {
    case "name":
      return byName();
    case "attendance":
      // full 먼저, partial 뒤
      return (
        Number(a.attendance !== "full") - Number(b.attendance !== "full") ||
        byName()
      );
    case "role":
      return byIndex(ROLE_INDEX, a.role, b.role);
    case "district":
      return byIndex(DISTRICT_INDEX, a.district, b.district);
    case "pickup":
      return byIndex(PICKUP_INDEX, a.pickup_location, b.pickup_location);
    case "language":
      return byIndex(LANG_INDEX, a.language, b.language);
    case "tshirt":
      // 사이즈 선언 순서(XXXS→XXXL). 미지정은 isMissing이 뒤로 보낸다.
      return byIndex(TSHIRT_INDEX, a.tshirt_size, b.tshirt_size);
    case "fee":
      // 6세미만=0, 미산정(null)=0 으로 취급.
      return (personFee(a) ?? 0) - (personFee(b) ?? 0) || byName();
    case "registered":
      return a.created_at.localeCompare(b.created_at) || byName();
    default: {
      // room: 방 타입 이름 → 호실 라벨 → 이름
      const ta = a.rooms?.room_types?.name ?? null;
      const tb = b.rooms?.room_types?.name ?? null;
      if (ta == null && tb == null) return byName();
      if (ta == null) return 1;
      if (tb == null) return -1;
      return (
        ta.localeCompare(tb) ||
        (a.rooms?.label ?? "").localeCompare(b.rooms?.label ?? "") ||
        byName()
      );
    }
  }
}

export function sortAttendees(
  rows: AttendeeWithRoom[],
  sort: SortState,
): AttendeeWithRoom[] {
  const out = [...rows];
  if (sort.key == null) {
    const heads = buildHeads(rows);
    out.sort((a, b) => compareDefault(a, b, heads));
    return out;
  }
  const key = sort.key;
  const sign = sort.dir === "desc" ? -1 : 1;
  if (key === "household") {
    // 가구주 이름 기준 정렬. 방향은 가구 순서에만 적용하고,
    // 같은 가구 내에선 항상 가구주 먼저 → created_at (가족이 묶여 보이게).
    const heads = buildHeads(rows);
    out.sort((a, b) => {
      const ha = nameKey(headOf(a, heads) ?? a);
      const hb = nameKey(headOf(b, heads) ?? b);
      return (
        sign * ha.localeCompare(hb) ||
        Number(b.is_householder) - Number(a.is_householder) ||
        a.created_at.localeCompare(b.created_at)
      );
    });
    return out;
  }
  out.sort((a, b) => {
    const ma = Number(isMissing(a, key));
    const mb = Number(isMissing(b, key));
    if (ma !== mb) return ma - mb;
    return sign * compareKey(a, b, key);
  });
  return out;
}

// ── 가구별 보기 정렬 ──
// 가구(head + members)는 항상 한 덩어리로 유지하고, 가구 사이 순서만 바꾼다.
// 기준 값은 가구주 행 (등록일은 가구 구성원 중 최신, 회비는 가구 합계).

function latestOf(h: Household): string {
  return [h.head, ...h.members].reduce(
    (m, a) => (a.created_at > m ? a.created_at : m),
    "",
  );
}

export function sortHouseholds(
  households: Household[],
  sort: SortState,
): Household[] {
  const out = [...households];
  const sign = sort.dir === "desc" ? -1 : 1;
  const byHeadName = (x: Household, y: Household) =>
    nameKey(x.head).localeCompare(nameKey(y.head));

  // 기본/미지정: 등록일 최신순 (한 명이라도 최근 등록이면 그 가구가 맨 위로)
  if (sort.key == null || sort.key === "registered") {
    const s = sort.key == null ? -1 : sign;
    out.sort((x, y) => s * latestOf(x).localeCompare(latestOf(y)) || byHeadName(x, y));
    return out;
  }
  if (sort.key === "fee") {
    out.sort((x, y) => sign * (x.total - y.total) || byHeadName(x, y));
    return out;
  }
  // 가구 정렬에서 '가구' 컬럼 = 가구주 이름 = 이름 컬럼과 동일 기준
  const key: SortKey = sort.key === "household" ? "name" : sort.key;
  out.sort((x, y) => {
    const ma = Number(isMissing(x.head, key));
    const mb = Number(isMissing(y.head, key));
    if (ma !== mb) return ma - mb;
    return sign * compareKey(x.head, y.head, key) || byHeadName(x, y);
  });
  return out;
}
