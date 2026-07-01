// DB enum 토큰 (라벨은 i18n messages 에서 번역)
export const GENDERS = ["male", "female"] as const;
export type Gender = (typeof GENDERS)[number];

export const ROLES = [
  "pastor", // 교역자 (목사·전도사 등)
  "elder", // 장로
  "gwonsa", // 권사
  "deacon", // 집사
  "member", // 성도
  "student", // 학생
  "child", // 유년
  "other", // 기타
] as const;
export type Role = (typeof ROLES)[number];

// 소속구역(Cell Group) 토큰. 라벨은 i18n "District" 네임스페이스에서 번역.
export const DISTRICTS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "im", // International Missionary
  "mahanaim", // 마하나임
  "michael", // 미가엘
  "gideon", // 기드온
] as const;
export type District = (typeof DISTRICTS)[number];

export const ATTENDANCE = ["full", "partial"] as const;
export type Attendance = (typeof ATTENDANCE)[number];

export const LANGUAGES = ["ko", "en", "es"] as const; // 한국어/영어/Spanish (관리자 지정)
export type Language = (typeof LANGUAGES)[number];

export interface Attendee {
  id: string;
  korean_name: string | null; // korean_name 또는 english_name 중 하나 필수 (DB name_required 제약)
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
  room_id: string | null; // 배정된 호실 (관리자 전용)
  language: Language; // 성도 언어 (관리자 전용, 기본 'ko')
  is_under_6: boolean; // 6세 미만 (회비 면제·객실 인원 제외)
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
  is_under_6?: boolean;
  attendance: Attendance;
  arrival_at?: string | null;
  departure_at?: string | null;
  note?: string | null;
}

export interface RoomType {
  id: string;
  name: string;
  capacity: number;
  price_per_person: number;
  sort_order: number;
  created_at: string;
}

export interface Room {
  id: string;
  label: string;
  room_type_id: string;
  note: string | null;
  sort_order: number;
  created_at: string;
}

export interface ScheduleItem {
  id: string;
  day: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS
  title: string;
  description: string | null;
  location: string | null;
  sort_order: number;
  created_at: string;
}

export interface Faq {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
  created_at: string;
}
