// DB enum 토큰 (라벨은 i18n messages 에서 번역)
export const GENDERS = ["male", "female"] as const;
export type Gender = (typeof GENDERS)[number];

export const ROLES = [
  "pastor", // 목사
  "elder", // 장로
  "gwonsa", // 권사
  "deacon", // 집사
  "seogyosa", // 서리집사
  "member", // 성도
  "student", // 학생
  "child", // 유년
  "other", // 기타
] as const;
export type Role = (typeof ROLES)[number];

export const ATTENDANCE = ["full", "partial"] as const;
export type Attendance = (typeof ATTENDANCE)[number];

export interface Attendee {
  id: string;
  korean_name: string;
  english_name: string | null;
  district: string | null; // 소속구역
  gender: Gender | null;
  role: Role;
  is_householder: boolean;
  householder_id: string | null; // self-FK → 가구주 행
  retreat_group: string | null; // 수련회조 (관리자 전용)
  is_group_leader: boolean; // 수련회조장 (관리자 전용)
  note: string | null;
  email: string | null; // 본인 수정 scoping 용
  phone: string | null;
  attendance: Attendance;
  arrival_at: string | null; // partial 일 때 필수
  departure_at: string | null; // partial 일 때 필수
  paid: boolean; // 회비 (관리자 전용)
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

// 등록 폼에서 성도가 직접 입력하는 필드 (관리자 전용 컬럼 제외)
export interface AttendeeInput {
  korean_name: string;
  english_name?: string | null;
  district?: string | null;
  gender?: Gender | null;
  role?: Role;
  email?: string | null;
  phone?: string | null;
  attendance: Attendance;
  arrival_at?: string | null;
  departure_at?: string | null;
  note?: string | null;
}
