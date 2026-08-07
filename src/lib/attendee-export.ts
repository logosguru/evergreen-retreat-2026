// 관리자 참석자 명단 → Excel 시트 데이터. (순수 함수 — 라벨은 호출부에서 i18n으로 주입)
import {
  groupHouseholds,
  householdBalance,
  personFee,
  type AttendeeWithRoom,
} from "./fees.ts";
import { displayName } from "./names.ts";
import type { FeePayment } from "./types.ts";
import type { XlsxSheet } from "./xlsx.ts";

// 토큰(enum) → 표시 라벨 변환기. 알 수 없는 값은 토큰 그대로 반환하도록 호출부에서 처리.
export type Label = (token: string) => string;

export interface ExportLabels {
  sheetAttendees: string;
  sheetPayments: string;
  // 참석자 시트 헤더
  h: {
    no: string;
    koreanName: string;
    englishName: string;
    household: string;
    isHead: string;
    householdSize: string;
    district: string;
    role: string;
    gender: string;
    under6: string;
    child612: string;
    language: string;
    attendance: string;
    arrival: string;
    departure: string;
    pickup: string;
    email: string;
    phone: string;
    roomType: string;
    room: string;
    retreatGroup: string;
    groupLeader: string;
    personFee: string;
    householdTotal: string;
    paidTotal: string;
    balance: string;
    status: string;
    methods: string;
    note: string;
    registered: string;
  };
  // 납입 내역 시트 헤더
  p: {
    head: string;
    district: string;
    date: string;
    amount: string;
    method: string;
    note: string;
    recordedAt: string;
  };
  role: Label;
  district: Label;
  gender: Label;
  attendance: Label;
  language: Label;
  pickup: Label;
  method: Label;
  yes: string;
  no: string;
  feeExempt: string;
  feePending: string;
  roomUnassigned: string;
  statusSettled: string;
  statusOwe: string;
  statusRefund: string;
  statusNoFee: string;
}

// 가구 단위 정산 상태 문자열.
export function statusOf(
  total: number,
  paid: number,
  L: ExportLabels,
): string {
  if (total === 0 && paid === 0) return L.statusNoFee;
  const bal = householdBalance(total, paid);
  if (bal > 0) return L.statusOwe;
  if (bal < 0) return L.statusRefund;
  return L.statusSettled;
}

function bool(v: boolean, L: ExportLabels): string {
  return v ? L.yes : L.no;
}

// timestamptz → 'YYYY-MM-DD HH:MM' (UTC 기준. 명단 대조용이라 로컬 변환은 생략)
function ts(v: string | null): string {
  if (!v) return "";
  return v.slice(0, 16).replace("T", " ");
}

export interface ExportInput {
  /** withHouseholdRoomType()로 전처리된 참석자 행 */
  attendees: AttendeeWithRoom[];
  payments: FeePayment[];
}

/**
 * 사람당 1행의 평면 리스트. 가구 단위 금액(가구 회비/납입/잔액)은 중복 합산을
 * 막기 위해 가구주 행에만 채우고, 정산 상태·납부 수단은 필터링 편의를 위해
 * 모든 행에 채운다.
 */
export function buildAttendeeSheet(
  { attendees, payments }: ExportInput,
  L: ExportLabels,
): XlsxSheet {
  const households = groupHouseholds(attendees);
  const totalByHead = new Map(households.map((h) => [h.head.id, h.total]));
  const sizeByHead = new Map(
    households.map((h) => [h.head.id, h.members.length + 1]),
  );
  const headById = new Map(households.map((h) => [h.head.id, h.head]));

  const paidByHead = new Map<string, number>();
  const methodsByHead = new Map<string, Set<string>>();
  for (const p of payments) {
    paidByHead.set(p.head_id, (paidByHead.get(p.head_id) ?? 0) + p.amount);
    if (p.method) {
      const set = methodsByHead.get(p.head_id) ?? new Set<string>();
      set.add(p.method);
      methodsByHead.set(p.head_id, set);
    }
  }

  // 가구가 붙어 보이도록 구역 → 가구주 이름 → 가구주 먼저 → 등록순.
  const sorted = [...attendees].sort((a, b) => {
    const ha = a.is_householder ? a.id : (a.householder_id ?? a.id);
    const hb = b.is_householder ? b.id : (b.householder_id ?? b.id);
    const da = a.district ?? "";
    const db = b.district ?? "";
    if (da !== db) return da.localeCompare(db);
    if (ha !== hb) {
      const na = displayName(headById.get(ha) ?? a);
      const nb = displayName(headById.get(hb) ?? b);
      const c = na.localeCompare(nb);
      if (c !== 0) return c;
      return ha.localeCompare(hb);
    }
    if (a.is_householder !== b.is_householder) return a.is_householder ? -1 : 1;
    return a.created_at.localeCompare(b.created_at);
  });

  const rows = sorted.map((a, i) => {
    const headId = a.is_householder ? a.id : (a.householder_id ?? a.id);
    const head = headById.get(headId);
    const total = totalByHead.get(headId) ?? 0;
    const paid = paidByHead.get(headId) ?? 0;
    const fee = personFee(a);
    const methods = [...(methodsByHead.get(headId) ?? [])]
      .map((m) => L.method(m))
      .join(", ");

    return [
      i + 1,
      a.korean_name ?? "",
      a.english_name ?? "",
      displayName(head ?? a),
      bool(a.is_householder, L),
      sizeByHead.get(headId) ?? 1,
      a.district ? L.district(a.district) : "",
      a.role ? L.role(a.role) : "",
      a.gender ? L.gender(a.gender) : "",
      bool(a.is_under_6, L),
      bool(a.is_child_6_12, L),
      L.language(a.language),
      L.attendance(a.attendance),
      a.arrival_at ?? "",
      a.departure_at ?? "",
      a.pickup_location ? L.pickup(a.pickup_location) : "",
      a.email ?? "",
      a.phone ?? "",
      a.requested_room_type?.name ?? "",
      a.rooms?.label ?? L.roomUnassigned,
      a.retreat_group ?? "",
      a.is_group_leader ? L.yes : "",
      a.is_under_6 ? L.feeExempt : fee == null ? L.feePending : fee,
      a.is_householder ? total : "",
      a.is_householder ? paid : "",
      a.is_householder ? householdBalance(total, paid) : "",
      statusOf(total, paid, L),
      methods,
      a.note ?? "",
      ts(a.created_at),
    ];
  });

  return {
    name: L.sheetAttendees,
    columns: [
      { header: L.h.no, width: 5 },
      { header: L.h.koreanName },
      { header: L.h.englishName },
      { header: L.h.household },
      { header: L.h.isHead },
      { header: L.h.householdSize },
      { header: L.h.district },
      { header: L.h.role },
      { header: L.h.gender },
      { header: L.h.under6 },
      { header: L.h.child612 },
      { header: L.h.language },
      { header: L.h.attendance },
      { header: L.h.arrival },
      { header: L.h.departure },
      { header: L.h.pickup },
      { header: L.h.email },
      { header: L.h.phone },
      { header: L.h.roomType },
      { header: L.h.room },
      { header: L.h.retreatGroup },
      { header: L.h.groupLeader },
      { header: L.h.personFee, money: true },
      { header: L.h.householdTotal, money: true },
      { header: L.h.paidTotal, money: true },
      { header: L.h.balance, money: true },
      { header: L.h.status },
      { header: L.h.methods },
      { header: L.h.note, width: 40 },
      { header: L.h.registered },
    ],
    rows,
  };
}

/** 납입 원장 1건 = 1행. 가구주 이름·구역을 붙여 단독으로도 읽히게 한다. */
export function buildPaymentSheet(
  { attendees, payments }: ExportInput,
  L: ExportLabels,
): XlsxSheet {
  const byId = new Map(attendees.map((a) => [a.id, a]));
  const rows = [...payments]
    .sort(
      (a, b) =>
        a.paid_at.localeCompare(b.paid_at) ||
        a.created_at.localeCompare(b.created_at),
    )
    .map((p) => {
      const head = byId.get(p.head_id);
      return [
        head ? displayName(head) : p.head_id,
        head?.district ? L.district(head.district) : "",
        p.paid_at,
        p.amount,
        p.method ? L.method(p.method) : "",
        p.note ?? "",
        ts(p.created_at),
      ];
    });

  return {
    name: L.sheetPayments,
    columns: [
      { header: L.p.head },
      { header: L.p.district },
      { header: L.p.date },
      { header: L.p.amount, money: true },
      { header: L.p.method },
      { header: L.p.note, width: 30 },
      { header: L.p.recordedAt },
    ],
    rows,
  };
}

export function buildAttendeeWorkbook(
  input: ExportInput,
  L: ExportLabels,
): XlsxSheet[] {
  return [buildAttendeeSheet(input, L), buildPaymentSheet(input, L)];
}
