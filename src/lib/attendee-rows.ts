import type { Attendance, Gender, Role } from "@/lib/types";

// 공개 등록·관리자 수동 입력이 공유하는 참석자 입력 shape + 행 생성/검증 로직.
// (서버 액션 아님 — 순수 함수라 register/actions·admin/actions 양쪽에서 재사용)

export type PersonInput = {
  korean_name: string;
  english_name?: string;
  district?: string;
  gender?: Gender | "";
  role?: Role | "";
  phone?: string;
  is_under_6?: boolean;
  attendance: Attendance;
  arrival_at?: string; // datetime-local 문자열
  departure_at?: string;
  note?: string;
};

export function clean(s?: string | null): string | null {
  const v = (s ?? "").trim();
  return v === "" ? null : v;
}

// datetime-local "YYYY-MM-DDTHH:mm" 문자열을 그대로 저장(wall-clock 보존).
// Date 변환을 거치지 않아 dev/prod 런타임 타임존에 흔들리지 않는다.
export function toTimestamp(s?: string): string | null {
  return clean(s);
}

// 이름(한글/영문 중 하나) 필수 + partial이면 도착/출발 필수. 오류 시 메시지 키 반환.
export function validatePerson(p: PersonInput): string | null {
  if (!clean(p.korean_name) && !clean(p.english_name)) return "validationName";
  if (
    p.attendance === "partial" &&
    (!clean(p.arrival_at) || !clean(p.departure_at))
  ) {
    return "validationPartial";
  }
  return null;
}

export function rowFor(
  p: PersonInput,
  opts: {
    id: string;
    is_householder: boolean;
    email: string | null;
    householder_id: string | null;
  },
) {
  return {
    id: opts.id,
    korean_name: clean(p.korean_name),
    english_name: clean(p.english_name),
    district: clean(p.district),
    gender: p.gender ? p.gender : null,
    role: p.role ? p.role : "member",
    phone: clean(p.phone),
    is_under_6: !!p.is_under_6,
    attendance: p.attendance,
    arrival_at: p.attendance === "partial" ? toTimestamp(p.arrival_at) : null,
    departure_at:
      p.attendance === "partial" ? toTimestamp(p.departure_at) : null,
    note: clean(p.note),
    is_householder: opts.is_householder,
    householder_id: opts.householder_id,
    email: opts.email,
  };
}
