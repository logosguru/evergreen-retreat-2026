import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { ScheduleItem } from "@/lib/types";
import { groupByDay, formatDayLabel, formatTime } from "@/lib/schedule";
import { bilingual } from "@/lib/poster";
import emblem from "../../public/retreat-emblem-2026.png";
import churchLogoLight from "../../public/evergreen-logo.webp"; // 흰색 — 어두운 배경용
import churchLogoDark from "../../public/evergreen-logo-pine.png"; // 파인그린 — 밝은 배경용
import qrKo from "../../public/qr/schedule-ko.png";
import qrEn from "../../public/qr/schedule-en.png";
import qrEs from "../../public/qr/schedule-es.png";

// 수련회 장소 벽에 붙이는 대형 이중언어 일정표 (18×24in 세로).
//
// 두 테마:
//   light — 종이 흰 바탕 + 잉크. 배경 그래픽 설정과 무관하게 항상 제대로 나온다.
//   dark  — 사이트 테마(파인그린 바탕). 인쇄 시 '배경 그래픽' 체크가 반드시 필요하다.
//
// 두 언어를 두 서체로 나눠 목소리를 구분한다: 한국어=나눔명조, 영어=Fraunces.
// (각 언어를 해당 서체로 명시 지정해 라틴 확장 글리프 fallback 문제가 생기지 않게 한다)

export type PosterTheme = "light" | "dark";

const QR = [
  { src: qrKo, label: "한국어" },
  { src: qrEn, label: "English" },
  { src: qrEs, label: "Español" },
];

export async function SchedulePoster({
  items,
  theme = "light",
}: {
  items: ScheduleItem[];
  theme?: PosterTheme;
}) {
  const tKo = await getTranslations({ locale: "ko", namespace: "Schedule" });
  const tEn = await getTranslations({ locale: "en", namespace: "Schedule" });
  const hKo = await getTranslations({ locale: "ko", namespace: "Home" });
  const hEn = await getTranslations({ locale: "en", namespace: "Home" });

  const groups = groupByDay(items);

  // 항목 블록은 하루 최대 개수에 맞춰 자동 축소한다. 15개까지는 1.0, 그 이상이면 비례 축소 —
  // 나중에 일정이 늘어도 포스터가 조용히 두 장으로 넘어가지 않게 하는 안전장치.
  const maxPerDay = Math.max(1, ...groups.map((g) => g.items.length));
  const unit = maxPerDay <= 15 ? 1 : Math.max(0.7, 15 / maxPerDay);

  const churchLogo = theme === "dark" ? churchLogoLight : churchLogoDark;

  return (
    <div
      className={`poster-root theme-${theme}`}
      style={{ "--u": unit } as React.CSSProperties}
    >
      {/* ── 마스트헤드: 주제 + 티셔츠 엠블럼 ── */}
      <header className="masthead">
        <div className="masthead-text">
          <p className="kicker">2026 Evergreen Summer Retreat</p>
          <h1 className="theme-ko">{hKo("theme")}</h1>
          <p className="theme-en">{hEn("theme")}</p>
          <p className="meta-dates">{hEn("dates")}</p>
        </div>
        {/* 공모로 정한 티셔츠 엠블럼. 어두운 테마에서는 원본 남색이 묻히므로
            아이보리 패널 위에 얹는다(당선작 색을 임의로 바꾸지 않는다). */}
        <figure className="emblem">
          <Image src={emblem} alt="Blessed Encounter · Evergreen 2026" priority />
        </figure>
      </header>

      <div className="rule rule-accent" />

      {/* ── 3일 = 3열. 짧은 날의 남는 공간에 말씀과 QR을 둔다 ── */}
      <div className="days">
        {groups.map((g, colIndex) => {
          const isLordsDay = new Date(`${g.day}T12:00:00`).getDay() === 0;
          const first = g.items[0];
          const last = g.items[g.items.length - 1];
          const isFirstCol = colIndex === 0;
          const isLastCol = colIndex === groups.length - 1;
          return (
            <section key={g.day} className="day">
              <div className="day-head">
                <h2 className="day-ko">
                  {/* 주일은 채운 마름모, 나머지 날은 빈 마름모 — 교회 일정표에서 의미 있는 구분 */}
                  <span className="dia" aria-hidden>
                    {isLordsDay ? "◆" : "◇"}
                  </span>
                  {formatDayLabel(g.day, "ko")}
                </h2>
                <p className="day-en">{formatDayLabel(g.day, "en")}</p>
                <p className="day-span">
                  {formatTime(first.start_time)} – {formatTime(last.start_time)}
                </p>
              </div>

              <ul className="items">
                {g.items.map((it) => {
                  const title = bilingual(it, "title");
                  const loc = bilingual(it, "location");
                  const desc = bilingual(it, "description");
                  // by_language 항목은 언어별로 다른 세션 → 장소·강사를 양쪽 다 표기
                  const split = it.by_language && (!loc.same || !desc.same);
                  return (
                    <li key={it.id} className="item">
                      <span className="time">{formatTime(it.start_time)}</span>
                      <span className="spine" aria-hidden>
                        <span className="dot">◆</span>
                      </span>
                      <div className="body">
                        <p className="title-ko">
                          {title.ko}
                          {it.by_language && <span className="tag">언어별</span>}
                        </p>
                        {/* 제목이 두 언어에서 같으면(원문이 영어인 'Orientation' 등) 한 번만 쓴다.
                            둘째 줄은 영어 제목 + 장소를 담고, 둘 다 없으면 줄 자체를 생략. */}
                        {(!title.same || (!split && loc.en)) && (
                          <p className="title-en">
                            {!title.same && title.en}
                            {!split && loc.en && (
                              <span className="loc">
                                {!title.same ? ` · ${loc.en}` : loc.en}
                              </span>
                            )}
                          </p>
                        )}
                        {split && (
                          <div className="split">
                            <p>
                              <span className="split-key">한국어</span>
                              <span className="split-val">
                                {loc.ko}
                                {desc.ko && (
                                  <span className="split-sub"> · {desc.ko}</span>
                                )}
                              </span>
                            </p>
                            <p>
                              <span className="split-key">EN · ES</span>
                              <span className="split-val">
                                {loc.en}
                                {desc.en && (
                                  <span className="split-sub"> · {desc.en}</span>
                                )}
                              </span>
                            </p>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* 반나절 일정인 첫날·마지막날 열의 남는 아래 공간을 채운다.
                  margin-top:auto 라 항목 수가 달라져도 항상 열 바닥에 붙는다. */}
              {isFirstCol && (
                <blockquote className="verse">
                  <p className="verse-ko">{hKo("verse")}</p>
                  <p className="verse-en">{hEn("verse")}</p>
                  <cite className="verse-ref">
                    {hKo("verseRef")} · {hEn("verseRef")}
                  </cite>
                </blockquote>
              )}

              {isLastCol && (
                <div className="qr-block">
                  <p className="qr-lead">
                    휴대폰으로 전체 일정 보기
                    <span className="qr-lead-en">
                      See the full schedule on your phone
                    </span>
                  </p>
                  <div className="qr-row">
                    {QR.map((q) => (
                      <figure key={q.label} className="qr">
                        <Image src={q.src} alt="" width={200} height={200} priority />
                        <figcaption>{q.label}</figcaption>
                      </figure>
                    ))}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="rule rule-accent rule-bottom" />

      <footer className="foot">
        <p className="foot-note">
          {tKo("subjectToChange")}
          <span className="foot-note-en">{tEn("subjectToChange")}</span>
        </p>
        <Image src={churchLogo} alt="Evergreen Church" className="foot-mark" priority />
      </footer>

      {/* @page 는 선택자로 범위를 못 잡는다 → globals.css 에 두면 모든 인쇄(관리자 실무용
          일정표 포함)의 용지가 바뀌므로, 이 페이지 문서에만 존재하는 style 로 넣는다. */}
      <style>{POSTER_CSS}</style>
    </div>
  );
}

const POSTER_CSS = `
/* 여백을 0으로 두고 포스터 안쪽 padding 으로 처리한다 → 어두운 배경이 종이 끝까지 찬다(full bleed).
   인쇄 대화상자에서 여백을 "없음"으로 두면 그대로 나온다. */
@page { size: 18in 24in; margin: 0; }

.poster-root {
  --u: 1;
  /* 의미 기반 토큰 — 테마별로 값만 갈아끼운다 */
  --paper: #fff;
  --ink: #14342b;      /* 주 텍스트 (한국어 제목·시간) */
  --ink-2: #3a6b5a;    /* 보조 텍스트 (영어 제목) */
  --ink-3: #5c574d;    /* 메타 (장소·안내) */
  --accent: #c89b3c;   /* 금색 — 마름모·괘선 */
  --hair: #cfc7b0;
  --panel: transparent;

  width: 18in;
  min-height: 24in;
  box-sizing: border-box;
  padding: 0.75in 0.7in;
  margin: 0 auto;
  background: var(--paper);
  /* 한글은 기본적으로 아무 곳에서나 꺾인다 — 단어 안에서 끊기지 않게 한다 */
  word-break: keep-all;
  overflow-wrap: break-word;
  color: var(--ink);
  font-family: var(--font-pretendard), sans-serif;
  display: flex;
  flex-direction: column;
  /* 어두운 테마는 배경 인쇄가 필수 — 브라우저에 색 보존을 명시한다 */
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.poster-root.theme-dark {
  --paper: #14342b;
  --ink: #f6f1e7;
  --ink-2: #dcc07f;
  --ink-3: #a8bdb2;
  --accent: #c89b3c;
  --hair: rgba(220, 192, 127, 0.34);
  --panel: #f6f1e7;
}

/* 화면에서는 축소해 한 장을 통째로 교정할 수 있게 (zoom 은 레이아웃까지 줄여 잘림이 없다) */
@media screen {
  .poster-root { zoom: 0.42; box-shadow: 0 4px 40px rgba(20,52,43,.28); }
}

.rule { border-top-style: solid; }
.rule-accent { border-top-width: 2pt; border-top-color: var(--accent); margin: 16pt 0 0; }
.rule-bottom { margin: 18pt 0 0; }

/* ── 마스트헤드 ── */
.masthead {
  display: flex; align-items: center; justify-content: space-between;
  gap: 0.5in;
}
.masthead-text { min-width: 0; }
.kicker {
  font-family: var(--font-fraunces), Georgia, serif;
  font-size: 19pt; font-weight: 700; letter-spacing: 0.13em; text-transform: uppercase;
  color: var(--accent); margin: 0;
}
.theme-ko {
  font-family: "Nanum Myeongjo", serif;
  font-size: 74pt; font-weight: 800; line-height: 0.98; letter-spacing: -0.015em;
  margin: 10pt 0 0; color: var(--ink);
}
.theme-en {
  font-family: var(--font-fraunces), Georgia, serif;
  font-size: 24pt; font-weight: 600; letter-spacing: 0.19em; text-transform: uppercase;
  color: var(--ink-2); margin: 9pt 0 0;
}
.meta-dates {
  font-family: var(--font-fraunces), Georgia, serif;
  font-size: 20pt; font-weight: 700; margin: 17pt 0 0; color: var(--ink);
}

.emblem { margin: 0; flex: 0 0 auto; }
.emblem img { display: block; width: 3.5in; height: auto; }
/* 어두운 바탕에서 엠블럼 남색이 묻히므로 아이보리 패널 위에 얹는다 */
.theme-dark .emblem {
  background: var(--panel); border-radius: 50%; padding: 0.16in;
}

/* ── 3열 ── */
.days { display: grid; grid-template-columns: repeat(3, 1fr); flex: 1; padding-top: 20pt; }
.day {
  display: flex; flex-direction: column;
  padding: 0 26pt; border-left: 0.5pt solid var(--hair);
}
.day:first-child { padding-left: 0; border-left: 0; }
.day:last-child { padding-right: 0; }

.day-head { margin-bottom: 13pt; }
.day-ko {
  font-family: "Nanum Myeongjo", serif;
  font-size: 31pt; font-weight: 800; line-height: 1.1; margin: 0; color: var(--ink);
  display: flex; align-items: baseline; gap: 9pt;
}
.dia { color: var(--accent); font-size: 16pt; }
.day-en {
  font-family: var(--font-fraunces), Georgia, serif;
  font-size: 14.5pt; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase;
  color: var(--ink-2); margin: 7pt 0 0 28pt;
}
.day-span {
  font-size: 12.5pt; font-variant-numeric: tabular-nums; color: var(--ink-3);
  margin: 5pt 0 0 28pt; letter-spacing: 0.04em;
}

/* ── 항목: 시간 | 금색 마름모 spine | 본문 ── */
.items { list-style: none; margin: 0; padding: 0; }
.item { display: grid; grid-template-columns: 0.9in 18pt 1fr; align-items: start; }
.item + .item { margin-top: calc(13pt * var(--u)); }
.time {
  font-size: calc(22pt * var(--u)); font-weight: 800; font-variant-numeric: tabular-nums;
  color: var(--ink); line-height: 1.16; letter-spacing: -0.01em;
  padding-top: calc(1.5pt * var(--u));
}
.spine {
  position: relative; align-self: stretch; display: flex; justify-content: center;
  border-left: 0.5pt solid var(--hair); margin-left: 8pt;
}
/* 금색 마름모는 spine(수직 획) '위'에 꿴 구슬처럼 앉는다 — 시간 숫자와 겹치지 않게 */
.dot {
  position: absolute; left: 0; top: calc(3.5pt * var(--u));
  transform: translateX(-50%);
  font-size: calc(8pt * var(--u)); line-height: 1;
  color: var(--accent); background: var(--paper); padding: 1pt 0;
}
.body { padding-left: 11pt; min-width: 0; }
.title-ko {
  font-family: "Nanum Myeongjo", serif;
  font-size: calc(23.5pt * var(--u)); font-weight: 700; line-height: 1.18;
  margin: 0; color: var(--ink);
}
.tag {
  font-family: var(--font-pretendard), sans-serif;
  font-size: calc(10.5pt * var(--u)); font-weight: 700; letter-spacing: 0.06em;
  color: var(--accent); border: 0.6pt solid var(--accent); border-radius: 3pt;
  padding: 1pt 4pt; margin-left: 7pt; vertical-align: 2.5pt; white-space: nowrap;
}
.title-en {
  font-family: var(--font-fraunces), Georgia, serif;
  font-size: calc(16pt * var(--u)); font-weight: 500; line-height: 1.24;
  color: var(--ink-2); margin: 2pt 0 0;
}
.loc { color: var(--ink-3); font-weight: 400; }

/* 언어별로 장소·강사가 다른 항목 — 벽 일정표에서 가장 중요한 정보 */
.split { margin: 4pt 0 0; }
.split p {
  font-size: calc(13pt * var(--u)); line-height: 1.4; margin: 0; color: var(--ink);
  display: flex; gap: 4pt;
}
.split-val { flex: 1 1 auto; min-width: 0; }
.split-key {
  flex: 0 0 auto; min-width: 0.62in;
  font-size: calc(11pt * var(--u)); font-weight: 800; letter-spacing: 0.05em;
  color: var(--accent); padding-top: 1pt;
}
.split-sub { color: var(--ink-3); font-weight: 400; }

/* ── 짧은 날 열의 남는 공간: 말씀 / QR (margin-top:auto 로 열 바닥에 붙임) ── */
.verse, .qr-block { margin-top: auto; }
.verse { padding: 34pt 0 0 14pt; border-left: 2pt solid var(--accent); }
.verse-ko {
  font-family: "Nanum Myeongjo", serif;
  font-size: 17.5pt; font-weight: 700; line-height: 1.55; margin: 0; color: var(--ink);
}
.verse-en {
  font-family: var(--font-fraunces), Georgia, serif;
  font-style: italic; font-size: 14pt; line-height: 1.5; margin: 9pt 0 0; color: var(--ink-2);
}
.verse-ref {
  display: block; font-size: 12pt; font-weight: 700; font-style: normal;
  letter-spacing: 0.06em; color: var(--accent); margin-top: 9pt;
}

.qr-block { padding-top: 34pt; }
.qr-lead { font-size: 14.5pt; font-weight: 700; color: var(--ink); line-height: 1.4; margin: 0 0 11pt; }
.qr-lead-en {
  display: block; font-family: var(--font-fraunces), Georgia, serif;
  font-size: 11pt; font-weight: 500; font-style: italic; color: var(--ink-2);
}
.qr-row { display: flex; gap: 13pt; }
.qr { margin: 0; text-align: center; }
/* QR 은 항상 흰 바탕이어야 스캔된다 — 어두운 테마에서는 흰 패딩을 둘러준다 */
.qr img { display: block; width: 1.5in; height: 1.5in; background: #fff; }
.theme-dark .qr img { padding: 3pt; border-radius: 2pt; }
.qr figcaption {
  font-size: 11.5pt; font-weight: 700; letter-spacing: 0.04em; color: var(--ink-3); margin-top: 5pt;
}

/* ── 푸터 ── */
.foot { display: flex; align-items: flex-end; justify-content: space-between; gap: 0.4in; padding-top: 12pt; }
.foot-note { font-size: 11pt; line-height: 1.45; color: var(--ink-3); margin: 0; }
.foot-note-en {
  display: block; font-family: var(--font-fraunces), Georgia, serif; font-style: italic;
}
/* 푸터 오른쪽 교회 로고 — 워드마크가 교회명 역할을 하므로 별도 텍스트를 두지 않는다 */
.foot-mark { width: 2.5in; height: auto; flex: 0 0 auto; }
`;
