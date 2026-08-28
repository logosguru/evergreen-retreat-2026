import { RETREAT_START, RETREAT_END } from "./types.ts";

// 수련회 현장 타임존. 참석자가 어느 기기 시간대에 있어도 현지(뉴욕) 기준으로 판정한다.
export const RETREAT_TIMEZONE = "America/New_York";

// 종료 시각(end_time) 컬럼이 없으므로 "지금 진행 중"은 다음 순서 시작까지로 본다.
// 다만 순서 사이 간격이 비정상적으로 길면(야간 등) 이 상한을 넘겨 표시하지 않는다.
export const NOW_MAX_MINUTES = 180;

export interface WallClock {
  day: string; // YYYY-MM-DD
  time: string; // HH:MM
}

export interface NowNext {
  nowIds: string[]; // 지금 진행 중인 순서 (같은 시각이면 여러 개)
  nextIds: string[]; // 바로 다음 순서 (같은 시각이면 여러 개)
}

const EMPTY: NowNext = { nowIds: [], nextIds: [] };

// Date → 뉴욕 현지 벽시계(날짜 + 시:분). 서버/브라우저 타임존과 무관하게 동작.
export function etWallClock(now: Date): WallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: RETREAT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";

  // hour12: false 는 ICU 버전에 따라 자정을 "24"로 내놓을 수 있다.
  const hour = get("hour") === "24" ? "00" : get("hour");

  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${hour}:${get("minute")}`,
  };
}

// "2026-09-05" + "19:30:00" → 분 단위 정수. 항목과 현재 시각을 같은 프레임(현지 벽시계)에서
// 비교하므로 UTC로 파싱해도 차이 계산은 정확하다.
function toMinutes(day: string, time: string): number {
  return Date.parse(`${day}T${time.slice(0, 5)}:00Z`) / 60000;
}

export interface ScheduleTimed {
  id: string;
  day: string;
  start_time: string;
}

// 현재 벽시계 기준으로 '지금'/'다음' 순서를 찾는다.
// 수련회 기간(RETREAT_START~END) 밖이면 아무것도 표시하지 않는다.
export function findNowNext<T extends ScheduleTimed>(
  items: T[],
  wall: WallClock,
): NowNext {
  if (wall.day < RETREAT_START || wall.day > RETREAT_END) return EMPTY;
  if (items.length === 0) return EMPTY;

  const nowMin = toMinutes(wall.day, wall.time);
  const timed = items
    .map((it) => ({ id: it.id, min: toMinutes(it.day, it.start_time) }))
    .sort((a, b) => a.min - b.min);

  let startedMin: number | null = null;
  let upcomingMin: number | null = null;
  for (const t of timed) {
    if (t.min <= nowMin) startedMin = t.min;
    else if (upcomingMin === null) upcomingMin = t.min;
  }

  const idsAt = (min: number | null) =>
    min === null ? [] : timed.filter((t) => t.min === min).map((t) => t.id);

  // 시작한 순서가 상한을 넘겼으면(야간 공백 등) '지금'으로 보지 않는다.
  // upcomingMin 은 정의상 항상 nowMin 보다 크므로 "다음 순서가 이미 시작" 경우는 없다.
  const nowActive =
    startedMin !== null && nowMin - startedMin < NOW_MAX_MINUTES;

  return {
    nowIds: nowActive ? idsAt(startedMin) : [],
    nextIds: idsAt(upcomingMin),
  };
}
