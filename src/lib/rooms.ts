import type { Room, RoomGrade } from "@/lib/types";

// 등급별 쿼터 사용 현황. "호실 개수" 기준 — 리조트가 방 단위로 잡아준 수량이므로
// 배정 인원과 무관. 쿼터 초과는 경고 표시용일 뿐 생성을 막지 않는다.
export interface GradeUsage {
  used: number;
  quota: number | null; // null = 무제한
  over: boolean;
}

export function gradeUsage(
  grades: RoomGrade[],
  rooms: Pick<Room, "grade_id">[],
): Map<string, GradeUsage> {
  const usage = new Map<string, GradeUsage>();
  for (const g of grades) {
    const used = rooms.filter((r) => r.grade_id === g.id).length;
    usage.set(g.id, {
      used,
      quota: g.quota,
      over: g.quota != null && used > g.quota,
    });
  }
  return usage;
}
