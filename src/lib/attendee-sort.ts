import { LANGUAGES } from "./types";
import type { AttendeeWithRoom } from "./fees";

export type SortKey = "household" | "attendance" | "room" | "language";
export interface SortState {
  key: SortKey | null;
  dir: "asc" | "desc";
}

const LANG_INDEX: Record<string, number> = Object.fromEntries(
  LANGUAGES.map((l, i) => [l, i]),
);

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

const nm = (a: AttendeeWithRoom) => a.korean_name;

// 기본(묶음): [가구주이름, 가구주먼저, created_at]
function compareDefault(
  a: AttendeeWithRoom,
  b: AttendeeWithRoom,
  heads: Map<string, AttendeeWithRoom>,
): number {
  const ha = headOf(a, heads)?.korean_name ?? a.korean_name;
  const hb = headOf(b, heads)?.korean_name ?? b.korean_name;
  return (
    ha.localeCompare(hb) ||
    Number(b.is_householder) - Number(a.is_householder) ||
    a.created_at.localeCompare(b.created_at)
  );
}

// 활성 키 asc 비교(미배정 처리는 sortAttendees에서 별도). tiebreak=이름.
function compareKey(
  a: AttendeeWithRoom,
  b: AttendeeWithRoom,
  key: SortKey,
): number {
  if (key === "attendance") {
    const o = (x: AttendeeWithRoom) => (x.attendance === "full" ? 0 : 1);
    return o(a) - o(b) || nm(a).localeCompare(nm(b));
  }
  if (key === "language") {
    return (
      (LANG_INDEX[a.language] ?? 99) - (LANG_INDEX[b.language] ?? 99) ||
      nm(a).localeCompare(nm(b))
    );
  }
  // room: 방 타입 이름 → 호실 라벨 → 이름
  const ta = a.rooms?.room_types?.name ?? null;
  const tb = b.rooms?.room_types?.name ?? null;
  if (ta == null && tb == null) return nm(a).localeCompare(nm(b));
  if (ta == null) return 1;
  if (tb == null) return -1;
  return (
    ta.localeCompare(tb) ||
    (a.rooms?.label ?? "").localeCompare(b.rooms?.label ?? "") ||
    nm(a).localeCompare(nm(b))
  );
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
      const ha = headOf(a, heads)?.korean_name ?? a.korean_name;
      const hb = headOf(b, heads)?.korean_name ?? b.korean_name;
      return (
        sign * ha.localeCompare(hb) ||
        Number(b.is_householder) - Number(a.is_householder) ||
        a.created_at.localeCompare(b.created_at)
      );
    });
    return out;
  }
  out.sort((a, b) => {
    if (key === "room") {
      // 미배정은 dir 무관 항상 맨 뒤
      const ua = a.rooms?.room_types?.name == null ? 1 : 0;
      const ub = b.rooms?.room_types?.name == null ? 1 : 0;
      if (ua !== ub) return ua - ub;
    }
    return sign * compareKey(a, b, key);
  });
  return out;
}
