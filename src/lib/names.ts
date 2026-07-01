// Attendee(row) 와 PersonInput(form) 둘 다 수용하도록 느슨하게.
type NameFields = {
  korean_name?: string | null;
  english_name?: string | null;
};

// 표시용 이름: 한글 우선, 없으면 영문, 둘 다 없으면 "—".
// (0008 이후 korean_name 은 nullable, name_required 제약이 최소 하나를 보장)
export function displayName(a: NameFields): string {
  return a.korean_name || a.english_name || "—";
}

// 정렬용 키: 한글 우선, 없으면 영문, 둘 다 없으면 "" (localeCompare 안전).
export function nameKey(a: NameFields): string {
  return a.korean_name || a.english_name || "";
}
