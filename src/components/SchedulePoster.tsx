import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { ScheduleItem } from "@/lib/types";
import { groupByDay, formatDayLabel, formatTime } from "@/lib/schedule";
import { bilingual } from "@/lib/poster";
import qrKo from "../../public/qr/schedule-ko.png";
import qrEn from "../../public/qr/schedule-en.png";
import qrEs from "../../public/qr/schedule-es.png";

// 수련회 장소 벽에 붙이는 대형 이중언어 일정표 (Tabloid 가로 17×11in).
//
// 디자인 원칙 — 잉크만 쓴다(색 면 채움 없음). 브라우저는 기본적으로 배경 그래픽을 인쇄에서
// 빼기 때문에, 색 띠에 의존하면 '배경 그래픽' 체크를 잊은 사람의 출력물이 망가진다.
// 대신 획(hairline)·금색 마름모·글자색만으로 구조를 만든다 → 어떤 설정에서도 같게 나오고
// 대형 출력 잉크도 아낀다.
//
// 두 언어를 두 서체로 나눠 목소리를 구분한다: 한국어=나눔명조, 영어=Fraunces.
// (라틴 확장 글리프 문제는 각 언어를 해당 서체로 명시 지정해 애초에 발생하지 않게 한다)

const QR = [
  { src: qrKo, label: "한국어" },
  { src: qrEn, label: "English" },
  { src: qrEs, label: "Español" },
];

export async function SchedulePoster({ items }: { items: ScheduleItem[] }) {
  const tKo = await getTranslations({ locale: "ko", namespace: "Schedule" });
  const tEn = await getTranslations({ locale: "en", namespace: "Schedule" });
  const hKo = await getTranslations({ locale: "ko", namespace: "Home" });
  const hEn = await getTranslations({ locale: "en", namespace: "Home" });

  const groups = groupByDay(items);

  // 항목 블록은 하루 최대 개수에 맞춰 자동 축소한다. 13개까지는 1.0, 그 이상이면 비례 축소 —
  // 나중에 일정이 늘어도 포스터가 조용히 두 장으로 넘어가지 않게 하는 안전장치.
  const maxPerDay = Math.max(1, ...groups.map((g) => g.items.length));
  const unit = maxPerDay <= 13 ? 1 : Math.max(0.72, 13 / maxPerDay);

  return (
    <div className="poster-root" style={{ "--u": unit } as React.CSSProperties}>
      {/* ── 마스트헤드: 왼쪽 주제, 오른쪽 일시·장소 (비대칭) ── */}
      <header className="masthead">
        <div>
          <h1 className="theme-ko">{hKo("theme")}</h1>
          <p className="theme-en">{hEn("theme")}</p>
        </div>
        <div className="masthead-meta">
          <p className="meta-dates">{hEn("dates")}</p>
          <p className="meta-venue">{hEn("location")}</p>
          <p className="meta-addr">{hEn("address")}</p>
        </div>
      </header>

      <div className="rule-gold" />

      {/* ── 3일 = 3열 ── */}
      <div className="days">
        {groups.map((g) => {
          const isLordsDay = new Date(`${g.day}T12:00:00`).getDay() === 0;
          const first = g.items[0];
          const last = g.items[g.items.length - 1];
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
                        {split ? (
                          <div className="split">
                            <p>
                              <span className="split-key">한국어</span>
                              {loc.ko}
                              {desc.ko && <span className="split-sub"> · {desc.ko}</span>}
                            </p>
                            <p>
                              <span className="split-key">EN · ES</span>
                              {loc.en}
                              {desc.en && <span className="split-sub"> · {desc.en}</span>}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="rule-gold rule-bottom" />

      {/* ── 푸터: 왼쪽 변경 안내, 오른쪽 QR ── */}
      <footer className="foot">
        <div className="foot-note">
          <p>{tKo("subjectToChange")}</p>
          <p className="foot-note-en">{tEn("subjectToChange")}</p>
        </div>
        <div className="qr-block">
          <p className="qr-lead">
            휴대폰으로 전체 일정 보기
            <span className="qr-lead-en">See the full schedule on your phone</span>
          </p>
          <div className="qr-row">
            {QR.map((q) => (
              <figure key={q.label} className="qr">
                <Image src={q.src} alt="" width={104} height={104} priority />
                <figcaption>{q.label}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </footer>

      {/* @page 는 선택자로 범위를 못 잡는다 → globals.css 에 두면 모든 인쇄(관리자 실무용
          일정표 포함)의 용지가 바뀌므로, 이 페이지 문서에만 존재하는 style 로 넣는다. */}
      <style>{POSTER_CSS}</style>
    </div>
  );
}

const POSTER_CSS = `
@page { size: 17in 11in; margin: 0.45in; }

.poster-root {
  --u: 1;
  --pine: #14342b;
  --moss: #3a6b5a;
  --gold: #c89b3c;
  --bark: #5c574d;
  --hair: #cfc7b0;
  width: 16.1in;
  margin: 0 auto;
  background: #fff;
  color: var(--pine);
  font-family: var(--font-pretendard), sans-serif;
  display: flex;
  flex-direction: column;
  gap: 0;
}
/* 화면에서는 축소해 한 장을 통째로 교정할 수 있게 (zoom 은 레이아웃까지 줄여 잘림이 없다) */
@media screen {
  .poster-root { zoom: 0.56; box-shadow: 0 2px 24px rgba(20,52,43,.18); padding: 0.45in; width: 17in; }
}

/* ── 마스트헤드 ── */
.masthead { display: flex; align-items: flex-end; justify-content: space-between; gap: 0.6in; }
.theme-ko {
  font-family: "Nanum Myeongjo", serif;
  font-size: 33pt; font-weight: 800; line-height: 1; letter-spacing: -0.01em; margin: 0;
}
.theme-en {
  font-family: var(--font-fraunces), Georgia, serif;
  font-size: 14pt; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase;
  color: var(--moss); margin: 4pt 0 0;
}
.masthead-meta { text-align: right; }
.meta-dates {
  font-family: var(--font-fraunces), Georgia, serif;
  font-size: 15pt; font-weight: 700; color: var(--pine); margin: 0;
}
.meta-venue { font-size: 11pt; font-weight: 600; color: var(--moss); margin: 3pt 0 0; }
.meta-addr { font-size: 9pt; color: var(--bark); margin: 2pt 0 0; }

.rule-gold { border-top: 1.5pt solid var(--gold); margin: 10pt 0 0; }
.rule-bottom { margin: 9pt 0 0; }

/* ── 3열 ── */
.days { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; flex: 1; }
.day { padding: 10pt 18pt 0; border-left: 0.5pt solid var(--hair); }
.day:first-child { padding-left: 0; border-left: 0; }
.day:last-child { padding-right: 0; }

.day-head { margin-bottom: 7pt; }
.day-ko {
  font-family: "Nanum Myeongjo", serif;
  font-size: 17pt; font-weight: 800; line-height: 1.1; margin: 0;
  display: flex; align-items: baseline; gap: 6pt;
}
.dia { color: var(--gold); font-size: 11pt; }
.day-en {
  font-family: var(--font-fraunces), Georgia, serif;
  font-size: 10pt; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--moss); margin: 4pt 0 0 17pt;
}
.day-span {
  font-size: 8.5pt; font-variant-numeric: tabular-nums; color: var(--bark);
  margin: 3pt 0 0 17pt; letter-spacing: 0.04em;
}

/* ── 항목: 시간 | 금색 마름모 spine | 본문 ── */
.items { list-style: none; margin: 0; padding: 0; }
.item { display: grid; grid-template-columns: 0.52in 14pt 1fr; align-items: start; }
.item + .item { margin-top: calc(5pt * var(--u)); }
.time {
  font-size: calc(12.5pt * var(--u)); font-weight: 800; font-variant-numeric: tabular-nums;
  color: var(--pine); line-height: 1.18; letter-spacing: -0.01em;
  padding-top: calc(1pt * var(--u));
}
.spine {
  position: relative; align-self: stretch; display: flex; justify-content: center;
  border-left: 0.5pt solid var(--hair); margin-left: 6pt;
}
/* 금색 마름모는 spine(수직 획) '위'에 꿴 구슬처럼 앉는다.
   left:0 = 획의 위치, translateX(-50%) 로 획 중앙 정렬. 시간 숫자와 겹치지 않게 한다. */
.dot {
  position: absolute; left: 0; top: calc(2pt * var(--u));
  transform: translateX(-50%);
  font-size: calc(6pt * var(--u)); line-height: 1;
  color: var(--gold); background: #fff; padding: 0.5pt 0;
}
.body { padding-left: 7pt; }
.title-ko {
  font-family: "Nanum Myeongjo", serif;
  font-size: calc(13.5pt * var(--u)); font-weight: 700; line-height: 1.18; margin: 0; color: var(--pine);
}
.tag {
  font-family: var(--font-pretendard), sans-serif;
  font-size: 7pt; font-weight: 700; letter-spacing: 0.06em; color: var(--gold);
  border: 0.5pt solid var(--gold); border-radius: 2pt;
  padding: 0.5pt 3pt; margin-left: 5pt; vertical-align: 1.5pt; white-space: nowrap;
}
.title-en {
  font-family: var(--font-fraunces), Georgia, serif;
  font-size: calc(10pt * var(--u)); font-weight: 500; line-height: 1.22; color: var(--moss); margin: 1pt 0 0;
}
.loc { color: var(--bark); font-weight: 400; }
.desc { font-size: 8.5pt; line-height: 1.3; color: var(--bark); margin: 1.5pt 0 0; }

/* 언어별로 장소·강사가 다른 항목 — 벽 일정표에서 가장 중요한 정보 */
.split { margin: 2pt 0 0; }
.split p { font-size: calc(8.5pt * var(--u)); line-height: 1.32; color: var(--pine); margin: 0; }
.split-key {
  display: inline-block; min-width: 0.46in;
  font-size: 7pt; font-weight: 800; letter-spacing: 0.05em; color: var(--gold);
}
.split-sub { color: var(--bark); font-weight: 400; }

/* ── 푸터 ── */
.foot { display: flex; align-items: flex-end; justify-content: space-between; gap: 0.5in; padding-top: 8pt; }
.foot-note { font-size: 8.5pt; line-height: 1.4; color: var(--bark); }
.foot-note p { margin: 0; }
.foot-note-en { font-family: var(--font-fraunces), Georgia, serif; font-style: italic; }
.qr-block { display: flex; align-items: flex-end; gap: 12pt; }
.qr-lead {
  text-align: right; font-size: 9.5pt; font-weight: 700; color: var(--pine);
  line-height: 1.35; margin: 0;
}
.qr-lead-en {
  display: block; font-family: var(--font-fraunces), Georgia, serif;
  font-size: 8.5pt; font-weight: 500; font-style: italic; color: var(--moss);
}
.qr-row { display: flex; gap: 9pt; }
.qr { margin: 0; text-align: center; }
.qr img { display: block; width: 0.85in; height: 0.85in; }
.qr figcaption {
  font-size: 7pt; font-weight: 700; letter-spacing: 0.04em; color: var(--bark); margin-top: 2pt;
}
`;
