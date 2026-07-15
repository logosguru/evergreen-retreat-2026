import type { Attendee } from "./types";

// Supabase 중첩 select 결과 형태.
// rooms = 물리적 배정(로지스틱스), requested_room_type = 성도 선택(회비 소스, head 행).
export type RoomTypeLite = { name: string; price_per_person: number };
export type AttendeeWithRoom = Attendee & {
  rooms:
    | {
        label: string;
        room_types: RoomTypeLite | null;
      }
    | null;
  requested_room_type?: RoomTypeLite | null;
};

export interface Household {
  head: AttendeeWithRoom;
  members: AttendeeWithRoom[]; // head 제외 가족
  total: number; // 가구 회비 합계(선택 타입 기준)
  unassignedCount: number; // 6세 미만 아닌데 회비 미산정(타입 미선택)인 인원
}

// 사람별 회비: 6세미만=0, 미선택=null, 그 외=가구주 선택 타입 단가.
// (requested_room_type는 withHouseholdRoomType로 가구원 행에도 채워져 있어야 정확)
export function personFee(a: AttendeeWithRoom): number | null {
  if (a.is_under_6) return 0;
  const price = a.requested_room_type?.price_per_person;
  return price == null ? null : price;
}

export function formatUSD(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

// 각 행의 requested_room_type를 그 가구 가구주(head)의 값으로 채운다.
// (Supabase 임베드는 head 행에만 값을 주므로, 가구원 회비 계산 위해 전파)
export function withHouseholdRoomType(
  rows: AttendeeWithRoom[],
): AttendeeWithRoom[] {
  const headType = new Map<string, RoomTypeLite | null>();
  for (const r of rows) {
    if (r.is_householder) headType.set(r.id, r.requested_room_type ?? null);
  }
  return rows.map((r) => {
    const hid = r.is_householder ? r.id : r.householder_id;
    return {
      ...r,
      requested_room_type: (hid ? headType.get(hid) : null) ?? null,
    };
  });
}

// 전체 참석자를 가구(head + members)로 묶고 합계 계산.
// 입력 rows는 withHouseholdRoomType로 전처리돼 있어야 한다.
export function groupHouseholds(rows: AttendeeWithRoom[]): Household[] {
  const heads = rows.filter((r) => r.is_householder);
  const byHead = new Map<string, AttendeeWithRoom[]>();
  for (const r of rows) {
    if (r.householder_id) {
      const list = byHead.get(r.householder_id) ?? [];
      list.push(r);
      byHead.set(r.householder_id, list);
    }
  }
  return heads.map((head) => {
    const members = byHead.get(head.id) ?? [];
    const people = [head, ...members];
    const total = people.reduce((sum, p) => sum + (personFee(p) ?? 0), 0);
    const unassignedCount = people.filter(
      (p) => !p.is_under_6 && personFee(p) == null,
    ).length;
    return { head, members, total, unassignedCount };
  });
}

// 가구주 id → 납입 합계(net, 환불 반영) 맵. 원장 행들을 head_id로 집계.
export function paidByHead(
  payments: { head_id: string; amount: number }[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of payments) m.set(p.head_id, (m.get(p.head_id) ?? 0) + p.amount);
  return m;
}

// 잔액: 양수 = 추가 납부 필요, 음수 = 환불 필요, 0 = 정산 완료.
export function householdBalance(total: number, paidTotal: number): number {
  return total - paidTotal;
}
