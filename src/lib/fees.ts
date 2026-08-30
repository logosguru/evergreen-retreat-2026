import type { Attendee } from "./types";

// Supabase 중첩 select 결과 형태.
// rooms = 물리적 배정(로지스틱스), requested_room_type = 성도 선택(회비 소스, head 행).
export type RoomTypeLite = {
  name: string;
  price_per_person: number;
  capacity: number;
};
// 실제로 방에서 자는 사람 = 객실 정원에 집계되는 인원.
// - 6세 미만: 회비·정원 규정상 제외 (호텔엔 별도 고지)
// - 부분 참석: 주일 당일만 왔다 가고 숙박하지 않음 → 방 산정 제외
// (정의는 여기 한 곳 — householdOccupants·AssignmentBoard가 공유한다)
export function occupiesRoom(p: {
  is_under_6: boolean;
  attendance: Attendee["attendance"];
}): boolean {
  return !p.is_under_6 && p.attendance !== "partial";
}

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

// 정액 회비(객실 타입 단가와 무관).
export const PARTIAL_FEE = 100; // 성인 부분 참석(주일만) — 숙박 없음
export const CHILD_PARTIAL_FEE = 50; // 6~12세 부분 참석
export const CHILD_FULL_FEE = 100; // 6~12세 전일 참석 (방 종류 무관)

// 교회 지원(감면) 기본 비율. 현재 관리자 UI가 주는 유일한 선택지.
// 컬럼(fee_discount_pct)은 0~100 이라 나중에 다른 비율을 더해도 스키마는 그대로다.
export const FEE_DISCOUNT_PCT = 50;

// 기본 회비에 감면 비율을 적용. SQL 쪽 round()와 같은 반올림(양수라 half-up 동일).
export function applyFeeDiscount(base: number, pct: number | null | undefined): number {
  const p = Math.min(100, Math.max(0, pct ?? 0));
  return Math.round((base * (100 - p)) / 100);
}

// 사람별 회비. 우선순위:
//   면제(fee_waived, 강사 등) → $0
//   6세 미만 → $0 (면제)
//   6~12세   → 부분 $50 / 전일 $100
//   성인     → 부분 $100 / 전일 = 가구주 선택 타입 단가 (미선택이면 null=미산정)
//   마지막에 fee_discount_pct(교회 지원) 만큼 감면 — 예) 4인실 $200 + 50% → $100
// (requested_room_type는 withHouseholdRoomType로 가구원 행에도 채워져 있어야 정확)
// SQL 쪽 동일 규칙: supabase/migrations/0029_fee_discount.sql household_total()
export function personFee(a: AttendeeWithRoom): number | null {
  const base = personBaseFee(a);
  return base == null ? null : applyFeeDiscount(base, a.fee_discount_pct);
}

// 감면 전 정가. 관리자 화면에서 "$200 → $100" 처럼 원가를 같이 보여줄 때 쓴다.
export function personBaseFee(a: AttendeeWithRoom): number | null {
  if (a.fee_waived) return 0;
  if (a.is_under_6) return 0;
  if (a.is_child_6_12)
    return a.attendance === "partial" ? CHILD_PARTIAL_FEE : CHILD_FULL_FEE;
  if (a.attendance === "partial") return PARTIAL_FEE;
  const price = a.requested_room_type?.price_per_person;
  return price == null ? null : price;
}

// 실제로 감면이 걸려 금액이 줄어든 사람인지 (배지·안내 문구 표시용).
export function hasFeeDiscount(a: AttendeeWithRoom): boolean {
  if (a.fee_waived || a.is_under_6) return false;
  return (a.fee_discount_pct ?? 0) > 0;
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

// 가구가 고른 객실 타입 정원 대비 실제 숙박 인원.
// 관리자 화면에서 가구 = "방"이므로, 4인실을 골랐는데 3명뿐인 방(=빈자리 1)을
// 골라내 합방·정산 대상을 찾는 데 쓴다. 인원 기준은 occupiesRoom(6세 미만·부분 참석 제외).
export interface HouseholdOccupancy {
  occupants: number;
  capacity: number | null; // null = 객실 타입 미선택
  openBeds: number; // 남은 자리 (미선택·초과면 0)
  under: boolean; // 정원 미달 (한 명 이상 있고 정원보다 적음)
  over: boolean;
}

export function householdOccupancy(h: Household): HouseholdOccupancy {
  const occupants = [h.head, ...h.members].filter(occupiesRoom).length;
  const capacity = h.head.requested_room_type?.capacity ?? null;
  if (capacity == null) {
    return { occupants, capacity: null, openBeds: 0, under: false, over: false };
  }
  return {
    occupants,
    capacity,
    openBeds: Math.max(0, capacity - occupants),
    under: occupants > 0 && occupants < capacity,
    over: occupants > capacity,
  };
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

// 참석자 id → 그 사람 몫으로 기록된 납입 합계. attendee_id 가 null(가구 전체 납부)인
// 행은 특정인에게 귀속되지 않으므로 제외한다.
export function paidByAttendee(
  payments: { attendee_id: string | null; amount: number }[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of payments) {
    if (!p.attendee_id) continue;
    m.set(p.attendee_id, (m.get(p.attendee_id) ?? 0) + p.amount);
  }
  return m;
}

// 개인 몫 정산 한 줄. fee=null 이면 미산정(객실 타입 미선택).
export interface PersonShare {
  person: AttendeeWithRoom;
  fee: number | null;
  paid: number; // 본인 앞으로 기록된 납입 합계
  remaining: number; // max(0, fee - paid). 미산정이면 0
}

// 가구 구성원별 몫/납입/잔여. 개인 납부 UI(성도 결제 버튼·관리자 현황)의 공통 소스.
export function personShares(
  people: AttendeeWithRoom[],
  payments: { attendee_id: string | null; amount: number }[],
): PersonShare[] {
  const paid = paidByAttendee(payments);
  return people.map((person) => {
    const fee = personFee(person);
    const p = paid.get(person.id) ?? 0;
    return {
      person,
      fee,
      paid: p,
      remaining: fee == null ? 0 : Math.max(0, fee - p),
    };
  });
}
