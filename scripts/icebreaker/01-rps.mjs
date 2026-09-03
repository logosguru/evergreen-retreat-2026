// Ice Breaker Game 01 — 가위바위보 챔피언십 슬라이드 (한/영/서 3개 언어)
// 실행: npm run icebreaker:01  → out/icebreaker/icebreaker-01-rps.pptx
// 기획 원본: Evergreen_Icebreaker_01_Rock_Paper_Scissors_Bilingual_v2.pdf (2등 상금은 프로그램표의 $20 채택)
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { C, F, W, newDeck, frame, headline, trilingual, stepSlide, rulesSlide, cueSlide } from './theme.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'out/icebreaker');
await mkdir(OUT, { recursive: true });

// 교회 로고 원본은 흰색 webp — pptx/Slides 호환을 위해 PNG 로 변환
const logoPng = path.join(OUT, 'evergreen-logo-white.png');
await sharp(path.join(ROOT, 'public/evergreen-logo.webp')).png().toFile(logoPng);
const emblem = path.join(ROOT, 'public/retreat-emblem-2026.png');
const asset = (name) => path.join(import.meta.dirname, 'assets', `emoji-${name}.png`);

const EYEBROW = 'ICE BREAKER · GAME 01';
const CUE = 'ROCK!  PAPER!  SCISSORS!  SHOOT!';
const CUE_ITEMS = [
  { image: asset('fist'), word: 'ROCK', sub: '바위 · Piedra' },
  { image: asset('hand'), word: 'PAPER', sub: '보 · Papel' },
  { image: asset('victory'), word: 'SCISSORS', sub: '가위 · Tijera' },
  { image: asset('target'), word: 'SHOOT!', sub: '여기서 냅니다!\n¡Aquí se tira!' },
];

const pres = newDeck();
const TOTAL = 13;
let n = 0;
const meta = () => ({ eyebrow: EYEBROW, pageNo: ++n, total: TOTAL });

// 1. 표지
{
  const s = frame(pres, meta());
  // 아이보리 원판 위 티셔츠 엠블럼 (당선작 색 그대로)
  const d = 4.2;
  const cx = 0.9;
  const cy = 1.55;
  s.addShape(pres.ShapeType.ellipse, { x: cx, y: cy, w: d, h: d, fill: { color: C.ivory }, line: { color: C.ivory } });
  s.addImage({ path: emblem, x: cx + 0.55, y: cy + 0.5, w: 3.1, h: 3.1 * (1402 / 1335), sizing: { type: 'contain', w: 3.1, h: 3.25 } });

  const tx = 5.8;
  const tw = W - 0.6 - tx;
  s.addText('GAME 01', { x: tx, y: 1.6, w: tw, h: 0.5, fontFace: F.latin, fontSize: 22, color: C.gold, charSpacing: 4 });
  headline(
    s,
    { ko: '가위바위보 챔피언십', en: 'Rock-Paper-Scissors Championship', es: 'Campeonato de Piedra, Papel o Tijera' },
    { x: tx, y: 2.05, w: tw, scale: 1.05, sizes: { ko: 48, en: 28, es: 26 } },
  );
  trilingual(
    s,
    { ko: '마지막 한 명의 챔피언을 찾습니다!', en: 'We play until one Evergreen Champion remains!', es: '¡Jugamos hasta que quede un solo campeón!' },
    { x: tx, y: 5.1, w: tw, h: 1.5, size: 18, gap: 2 },
  );
  s.addImage({ path: logoPng, x: W - 0.6 - 2.2, y: 6.9, w: 2.2, h: 2.2 * (353 / 1500) });
}

// 2–3. 규칙 (3 + 2)
rulesSlide(pres, meta(), {
  kicker: 'RULES · 규칙 · REGLAS',
  rules: [
    { n: 1, ko: '두 사람이 가위바위보를 합니다.', en: 'Two people play Rock, Paper, Scissors.', es: 'Dos personas juegan piedra, papel o tijera.' },
    { n: 2, ko: '진 사람은 앉지 않습니다 — 승자의 응원단이 됩니다!', en: 'The loser does NOT sit down — you become the winner’s cheerleader!', es: 'El que pierde NO se sienta: ¡se convierte en animador del ganador!' },
    { n: 3, ko: '진 사람은 승자 뒤에 서서 어깨에 손을 얹고 따라다닙니다.', en: 'Losers line up behind the winner, hands on their shoulders, and follow them.', es: 'Los que pierden van detrás del ganador, manos en sus hombros, y lo siguen.' },
  ],
});
rulesSlide(pres, meta(), {
  kicker: 'RULES · 규칙 · REGLAS',
  rules: [
    { n: 4, ko: '승자의 이름을 묻고, 그 이름을 외치며 응원합니다.', en: 'Ask the winner’s name — and cheer for them BY NAME.', es: 'Pregunta el nombre del ganador y anímalo POR SU NOMBRE.' },
    { n: 5, ko: '챔피언이 지면 그 팀 전체가 이긴 챔피언의 줄 뒤에 합류합니다.', en: 'When a champion loses, the whole team joins the back of the winning champion’s line.', es: 'Si un campeón pierde, todo su equipo se une al final de la fila del campeón ganador.' },
  ],
});

// 4. 구호
cueSlide(pres, meta(), {
  kicker: 'THE CUE · 구호 · LA SEÑAL',
  items: CUE_ITEMS,
  footer: {
    ko: '모두 “SHOOT!”에 손을 냅니다. 비기면 바로 다시!',
    en: 'Everyone throws on “SHOOT!” — ties replay immediately.',
    es: 'Todos tiran en “SHOOT!” — si hay empate, ¡otra vez!',
  },
});

// 5. 연습
stepSlide(pres, meta(), {
  kicker: 'PRACTICE',
  big: '0',
  title: { ko: '연습 한 번!', en: 'Practice Round', es: 'Ronda de práctica' },
  body: {
    ko: 'MC를 따라 손동작과 구호를 한 번 연습합니다.',
    en: 'Follow the MCs — one practice round together.',
    es: 'Sigan a los MC — una ronda de práctica juntos.',
  },
  cueLine: CUE,
});

// 6. Round 1
stepSlide(pres, meta(), {
  kicker: 'ROUND',
  big: '1',
  title: { ko: '첫 만남', en: 'Meet Someone', es: 'Conoce a alguien' },
  body: {
    ko: '잘 모르는 사람 한 명을 찾아 마주 서세요. 가족이나 같이 온 분은 피해 주세요. 아직 시작하지 마세요!',
    en: 'Find one person you don’t know well — not family, not who you came with. Face each other, but don’t play yet!',
    es: 'Busca a alguien que no conozcas bien — ni familia, ni con quien viniste. Frente a frente, ¡pero todavía no jueguen!',
  },
});

// 7. Round 2
stepSlide(pres, meta(), {
  kicker: 'ROUND',
  big: '2',
  title: { ko: '응원 시작!', en: 'Start the Cheer', es: '¡A animar!' },
  body: {
    ko: '챔피언은 앞에, 응원단은 뒤에서 어깨에 손을 얹고! 챔피언의 이름을 물어보고 응원 준비하세요.',
    en: 'Champions in front, cheerleaders behind with hands on shoulders! Ask your champion’s name and get ready to cheer.',
    es: '¡Campeones adelante, animadores atrás con las manos en los hombros! Pregunta el nombre de tu campeón y prepárate para animar.',
  },
});

// 8. Round 3
stepSlide(pres, meta(), {
  kicker: 'ROUND',
  big: '3',
  title: { ko: '응원 열기!', en: 'Build the Energy', es: '¡Sube la energía!' },
  body: {
    ko: '팀이 커지고 있습니다! 셋을 세면 챔피언 이름을 가장 크게 외쳐 주세요. 하나, 둘, 셋!',
    en: 'Your teams are getting bigger! On three, cheer your champion’s name as loud as you can. One, two, THREE!',
    es: '¡Sus equipos están creciendo! A la de tres, griten el nombre de su campeón. ¡Uno, dos, TRES!',
  },
});

// 9. Round 4–5
stepSlide(pres, meta(), {
  kicker: 'ROUNDS',
  big: '4–5',
  title: { ko: '팀이 커집니다', en: 'Bigger Teams', es: 'Equipos más grandes' },
  body: {
    ko: '챔피언은 손을 들고 다른 챔피언을 찾으세요. 응원단은 챔피언을 따라 앞쪽으로 이동!',
    en: 'Champions, hands up — find another champion. Cheerleaders, follow your champion toward the front!',
    es: 'Campeones, ¡manos arriba! Busquen otro campeón. Animadores, ¡sigan a su campeón hacia el frente!',
  },
});

// 10. 준결승 (MC 대진)
stepSlide(pres, meta(), {
  kicker: 'FINAL CHAMPIONS',
  big: '5–6',
  title: { ko: '모두 멈추세요!', en: 'Everybody Freeze!', es: '¡Todos quietos!' },
  body: {
    ko: '남은 챔피언은 팀과 함께 앞으로 나오세요. 이제부터 MC가 대진을 정하고 한 경기씩 진행합니다.',
    en: 'Champions, come forward with your teams. From here the MC pairs the matches — one at a time.',
    es: 'Campeones, al frente con sus equipos. Desde ahora el MC forma las parejas — una a la vez.',
  },
});

// 11. 결승
stepSlide(pres, meta(), {
  kicker: 'CHAMPIONSHIP FINAL',
  big: '2',
  title: { ko: '결승전', en: 'The Final', es: 'La Gran Final' },
  body: {
    ko: '마지막 두 챔피언! 결승전은 3판 2선승입니다. 어느 팀이 더 크게 응원하는지도 보겠습니다!',
    en: 'The final two champions! The final is BEST TWO OUT OF THREE. Let’s hear which team cheers louder!',
    es: '¡Los dos últimos campeones! La final es AL MEJOR DE TRES. ¡Veamos qué equipo anima más fuerte!',
  },
});

// 12. 결승 구호 (전원 함께)
cueSlide(pres, meta(), {
  kicker: 'FINAL · BEST 2 OF 3 · 다 함께 · ¡TODOS JUNTOS!',
  items: CUE_ITEMS.map(({ image, word }) => ({ image, word })),
  big: true,
  footer: {
    ko: '마지막 판은 모두 함께 구호를 외칩니다!',
    en: 'For the deciding game, the whole room calls the cue together!',
    es: '¡En el juego decisivo, toda la sala grita la señal juntos!',
  },
});

// 13. 시상
{
  const s = frame(pres, meta());
  s.addText('AWARDS · 시상 · PREMIOS', { x: 0.6, y: 0.95, w: 8, h: 0.45, fontFace: F.latin, fontSize: 18, color: C.gold, charSpacing: 3 });
  const cards = [
    { ko: '챔피언', en: 'Champion', es: 'Campeón', prize: '$30', medal: asset('trophy') },
    { ko: '준우승', en: 'Runner-up', es: 'Subcampeón', prize: '$20', medal: asset('silver') },
  ];
  const cw = 5.6;
  cards.forEach((c, i) => {
    const x = 0.6 + i * (cw + 0.9);
    const y = 1.6;
    s.addShape(pres.ShapeType.roundRect, {
      x, y, w: cw, h: 4.0, rectRadius: 0.15,
      fill: { color: i === 0 ? C.gold : C.pineDeep }, line: { color: C.gold, width: 1.5 },
    });
    const ink = i === 0 ? C.pineDeep : C.ivory;
    const ink2 = i === 0 ? C.pineDeep : C.goldSoft;
    s.addImage({ path: c.medal, x: x + cw / 2 - 0.5, y: y + 0.3, w: 1.0, h: 1.0 });
    s.addText(c.prize, { x, y: y + 1.3, w: cw, h: 1.1, align: 'center', valign: 'middle', fontFace: F.latin, fontSize: 72, bold: true, color: ink });
    s.addText('Amazon Gift Card', { x, y: y + 2.35, w: cw, h: 0.4, align: 'center', fontFace: F.sans, fontSize: 16, color: ink2 });
    s.addText(
      [
        { text: c.ko, options: { fontFace: F.ko, color: ink, fontSize: 28, bold: true, breakLine: true } },
        { text: `${c.en} · ${c.es}`, options: { fontFace: F.latin, color: ink2, fontSize: 20 } },
      ],
      { x, y: y + 2.8, w: cw, h: 1.15, align: 'center', valign: 'top' },
    );
  });
  trilingual(
    s,
    { ko: '두 분께 큰 박수 부탁드립니다!', en: 'A huge round of applause for our finalists!', es: '¡Un gran aplauso para nuestros finalistas!' },
    { x: 0.6, y: 5.75, w: W - 1.2, h: 1.05, size: 16, gap: 0 },
  );
}

if (n !== TOTAL) throw new Error(`slide count ${n} != TOTAL ${TOTAL}`);
const file = path.join(OUT, 'icebreaker-01-rps.pptx');
await pres.writeFile({ fileName: file });
console.log('wrote', path.relative(ROOT, file));
