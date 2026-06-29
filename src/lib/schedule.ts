import type { ScheduleItem } from "./types";

export interface ScheduleDay {
  day: string; // YYYY-MM-DD
  items: ScheduleItem[];
}

// day 별로 그룹: 그룹은 날짜 오름차순, 그룹 내 항목은 (start_time, sort_order) 오름차순
export function groupByDay(items: ScheduleItem[]): ScheduleDay[] {
  const map = new Map<string, ScheduleItem[]>();
  for (const it of items) {
    const arr = map.get(it.day) ?? [];
    arr.push(it);
    map.set(it.day, arr);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, dayItems]) => ({
      day,
      items: [...dayItems].sort(
        (x, y) =>
          x.start_time.localeCompare(y.start_time) || x.sort_order - y.sort_order,
      ),
    }));
}

// "2026-09-05" → 로케일별 날짜+요일. 정오 기준으로 파싱해 타임존 경계 흔들림 방지.
export function formatDayLabel(day: string, locale: string): string {
  const d = new Date(`${day}T12:00:00`);
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(d);
}

// "18:00:00" 또는 "18:00" → "18:00"
export function formatTime(time: string): string {
  return time.slice(0, 5);
}
