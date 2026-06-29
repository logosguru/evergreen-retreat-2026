import type { Attendee } from "./types";

// Supabase 중첩 select 결과 형태: attendees + rooms(label, room_types(...))
export type AttendeeWithRoom = Attendee & {
  rooms:
    | {
        label: string;
        room_types: { name: string; price_per_person: number } | null;
      }
    | null;
};

export interface Household {
  head: AttendeeWithRoom;
  members: AttendeeWithRoom[]; // head 제외 가족
  total: number; // 가구 회비 합계(배정분만)
  unassignedCount: number; // 6세 미만 아닌데 미배정인 인원
}

// 사람별 회비: 6세미만=0, 미배정=null, 그 외=방 타입 단가
export function personFee(a: AttendeeWithRoom): number | null {
  if (a.is_under_6) return 0;
  const price = a.rooms?.room_types?.price_per_person;
  return price == null ? null : price;
}

export function formatUSD(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

// 전체 참석자를 가구(head + members)로 묶고 합계 계산
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
      (p) => !p.is_under_6 && p.room_id == null,
    ).length;
    return { head, members, total, unassignedCount };
  });
}
