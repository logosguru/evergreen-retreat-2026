// Ice Breaker Game 02 — Group Up! 복된 만남 (한/영/서 3개 언어)
// 실행: npm run icebreaker:02  → out/icebreaker/icebreaker-02-groupup.pptx
// 라운드 구성은 실 등록 DB 시뮬레이션으로 정함(티켓제 + "정확히 1명" 앵커 + IM 상시 VIP). 상세: 이 파일의 ROUNDS.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { C, F, W, newDeck, frame, headline, trilingual, rulesSlide, cueSlide, roundSlide } from './theme.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'out/icebreaker');
await mkdir(OUT, { recursive: true });
const logoPng = path.join(OUT, 'evergreen-logo-white.png');
await sharp(path.join(ROOT, 'public/evergreen-logo.webp')).png().toFile(logoPng);
const emblem = path.join(ROOT, 'public/retreat-emblem-2026.png');
const asset = (name) => path.join(import.meta.dirname, 'assets', `emoji-${name}.png`);

const EYEBROW = 'ICE BREAKER · GAME 02';
const pres = newDeck();
const TOTAL = 13;
let n = 0;
const meta = () => ({ eyebrow: EYEBROW, pageNo: ++n, total: TOTAL });

// 1. 표지
{
  const s = frame(pres, meta());
  const d = 4.2, cx = 0.9, cy = 1.55;
  s.addShape(pres.ShapeType.ellipse, { x: cx, y: cy, w: d, h: d, fill: { color: C.ivory }, line: { color: C.ivory } });
  s.addImage({ path: emblem, x: cx + 0.55, y: cy + 0.5, w: 3.1, h: 3.1 * (1402 / 1335), sizing: { type: 'contain', w: 3.1, h: 3.25 } });
  const tx = 5.8, tw = W - 0.6 - tx;
  s.addText('GAME 02', { x: tx, y: 1.6, w: tw, h: 0.5, fontFace: F.latin, fontSize: 22, color: C.gold, charSpacing: 4 });
  headline(
    s,
    { ko: 'Group Up! 복된 만남', en: 'Group Up! Blessed Encounter', es: '¡Agrúpense! Encuentro Bendito' },
    { x: tx, y: 2.05, w: tw, scale: 1.05, sizes: { ko: 48, en: 30, es: 26 } },
  );
  trilingual(
    s,
    { ko: '음악이 멈추면 — 조건에 맞는 그룹을 가장 빨리 만드세요!', en: 'When the music stops, build the right group — fast!', es: 'Cuando pare la música, ¡formen el grupo correcto — rápido!' },
    { x: tx, y: 5.1, w: tw, h: 1.5, size: 18, gap: 2 },
  );
  s.addImage({ path: logoPng, x: W - 0.6 - 2.2, y: 6.9, w: 2.2, h: 2.2 * (353 / 1500) });
}

// 2. 방식
cueSlide(pres, meta(), {
  kicker: 'HOW IT WORKS · 방식 · CÓMO FUNCIONA',
  items: [
    { image: asset('note'), word: 'MOVE', sub: '음악 — 미션 하며 섞이기\nMúsica — misión y mezcla' },
    { image: asset('stop'), word: 'STOP', sub: '음악 멈춤 — 조건 발표\nAlto — se anuncia la condición' },
    { image: asset('group'), word: 'GROUP', sub: '인원 맞춰 모여 앉고 손 들기\nJúntense, siéntense, mano arriba' },
    { image: asset('ticket'), word: 'TICKET', sub: '준비위원 확인 → 티켓\nEl staff verifica → boleto' },
  ],
  footer: {
    ko: '티켓 받은 그룹만 다음 라운드로! 티켓 수는 MC가 라운드마다 발표합니다.',
    en: 'Only groups with a ticket move on. The MC announces how many tickets each round.',
    es: 'Solo los grupos con boleto siguen. El MC anuncia cuántos boletos hay en cada ronda.',
  },
});

// 3. 규칙 (3개)
rulesSlide(pres, meta(), {
  kicker: 'RULES · 규칙 · REGLAS',
  rules: [
    { n: 1, ko: '뛰지 않습니다 — 빠르게, 그러나 안전하게.', en: 'No running — move quickly but safely.', es: 'No corran — muévanse rápido pero con cuidado.' },
    { n: 2, ko: '추측 금지! 직접 물어보세요 — "어느 기관이세요?"', en: 'Don’t guess — ASK: “Which ministry?” “What language?”', es: 'No adivinen — PREGUNTEN: «¿Qué ministerio?» «¿Qué idioma?»' },
    { n: 3, ko: '티켓이 모자라면 — 그룹 대표끼리 가위바위보!', en: 'Not enough tickets? Group reps play Rock-Paper-Scissors!', es: '¿Faltan boletos? ¡Los representantes juegan piedra, papel o tijera!' },
  ],
});

// 4. 연습
roundSlide(pres, meta(), {
  kicker: 'PRACTICE',
  size: 5,
  title: { ko: '연습 라운드', en: 'Practice Round', es: 'Ronda de práctica' },
  conditions: [
    { ko: '한국어 사용자와 영어 사용자가 모두 있어야 합니다', en: 'Korean AND English speakers in the group', es: 'Hablantes de coreano Y de inglés en el grupo' },
    { ko: '같은 가족은 안 됩니다', en: 'No family members together', es: 'Sin familiares juntos' },
  ],
  note: '연습이라 탈락 없음 · No elimination — just practice · Sin eliminación — solo práctica',
  music: { ko: '걸으면서 지나가는 사람에게 손 흔들기', en: 'Wave at everyone you pass', es: 'Saluda con la mano a todos' },
  musicIcon: asset('note'),
});

// 5~10. 라운드 — 순서는 남은 인원 보고 MC가 현장에서 고름(번호 없음). 티켓 수 = 조건 해당자 손 든 수 − 1~2 (MC 발표).
const ROUNDS = [
  {
    size: 7,
    title: { ko: '첫 그룹', en: 'First Groups', es: 'Primeros grupos' },
    conditions: [
      { ko: '남성 2명 이상 + 여성 2명 이상', en: 'At least 2 men and 2 women', es: 'Al menos 2 hombres y 2 mujeres' },
      { ko: '한국어 사용자와 영어 사용자 모두', en: 'Korean AND English speakers', es: 'Hablantes de coreano Y de inglés' },
    ],
    music: { ko: '처음 보는 사람 3명과 하이파이브!', en: 'High-five 3 people you don’t know', es: '¡Choca los cinco con 3 desconocidos!' },
  },
  {
    size: 5,
    title: { ko: '청년을 찾아라!', en: 'Find a Young Adult!', es: '¡Busca a un joven!' },
    conditions: [
      { ko: '미가엘 청년 정확히 1명 — 두 명이면 티켓 없음!', en: 'EXACTLY ONE Michael young adult (two = no ticket!)', es: 'EXACTAMENTE UN joven de Michael' },
    ],
    music: { ko: '다른 언어로 인사하기 — 안녕하세요 · Hello · ¡Hola!', en: 'Greet in another language', es: 'Saluda en otro idioma' },
  },
  {
    size: 8,
    title: { ko: '마하나임을 찾아라!', en: 'Find Mahanaim!', es: '¡Busca a Mahanaim!' },
    conditions: [
      { ko: '마하나임 정확히 1명', en: 'EXACTLY ONE Mahanaim member', es: 'EXACTAMENTE UN miembro de Mahanaim' },
    ],
    music: { ko: '악수하면서 이름 하나 새로 외우기', en: 'Shake hands and learn one new name', es: 'Da la mano y aprende un nombre nuevo' },
  },
  {
    size: 10,
    title: { ko: '권사님을 모셔라!', en: 'Bring a Kwonsa!', es: '¡Trae a una Kwonsa!' },
    conditions: [
      { ko: '권사님 정확히 1명', en: 'EXACTLY ONE Kwonsa (senior deaconess)', es: 'EXACTAMENTE UNA Kwonsa (diaconisa mayor)' },
      { ko: '기드온 1명 이상', en: 'At least ONE Gideon student', es: 'Al menos UN estudiante de Gedeón' },
    ],
    music: { ko: '박자에 맞춰 박수 치며 걷기', en: 'Clap to the beat as you walk', es: 'Aplaude al ritmo mientras caminas' },
  },
  {
    size: 10,
    title: { ko: '세대와 언어', en: 'Generations & Languages', es: 'Generaciones e idiomas' },
    conditions: [
      { ko: '학생 정확히 1명', en: 'EXACTLY ONE student', es: 'EXACTAMENTE UN estudiante' },
      { ko: '청년(미가엘·마하나임) 정확히 1명', en: 'EXACTLY ONE young adult (Michael / Mahanaim)', es: 'EXACTAMENTE UN joven' },
      { ko: '스페인어 사용자 1명 이상', en: 'At least ONE Spanish speaker', es: 'Al menos UN hispanohablante' },
    ],
    music: { ko: '"어느 기관이세요?" 3명에게 묻기', en: 'Ask 3 people their ministry', es: 'Pregunta su ministerio a 3 personas' },
  },
  {
    size: 10,
    title: { ko: '세 언어, 세 세대', en: 'Three Languages, Three Generations', es: 'Tres idiomas, tres generaciones' },
    conditions: [
      { ko: '한국어 · 영어 · 스페인어 사용자 각 1명 이상', en: 'Korean, English AND Spanish speakers', es: 'Hablantes de coreano, inglés Y español' },
      { ko: '청년 1명 이상', en: 'At least ONE young adult', es: 'Al menos UN joven' },
      { ko: '장로님 또는 권사님 1명 이상', en: 'At least ONE Elder or Kwonsa', es: 'Al menos UN anciano o Kwonsa' },
    ],
    music: { ko: '아직 이름 모르는 사람에게 이름 묻기', en: 'Learn a name you don’t know yet', es: 'Aprende un nombre que aún no sabes' },
  },
];
for (const r of ROUNDS) roundSlide(pres, meta(), { ...r, kicker: 'ROUND', tickets: null, ticketIcon: asset('ticket'), musicIcon: asset('note') });

// 11. 결승 — 이름 대결
{
  const s = frame(pres, meta());
  s.addText('FINAL · 결승 · FINAL', { x: 0.6, y: 0.95, w: 8, h: 0.45, fontFace: F.latin, fontSize: 18, color: C.gold, charSpacing: 3 });
  s.addImage({ path: asset('mega'), x: 0.6, y: 1.6, w: 1.6, h: 1.6 });
  headline(
    s,
    { ko: '이름을 아시나요?', en: 'Do You Know Their Names?', es: '¿Sabes sus nombres?' },
    { x: 2.5, y: 1.3, w: W - 0.6 - 2.5 },
  );
  trilingual(
    s,
    {
      ko: '남은 세 그룹이 차례로 나옵니다. 한 사람씩 그룹 전원의 이름을 말합니다. 틀리면 — "That’s not a Blessed Encounter yet!" 가장 많이 맞힌 그룹이 우승!',
      en: 'The final three groups come up one at a time. Each person names everyone in the group. Miss one — “That’s not a Blessed Encounter yet!” Most correct names wins!',
      es: 'Los tres grupos finales salen uno por uno. Cada persona dice el nombre de todos. Si falla — «That’s not a Blessed Encounter yet!» ¡Gana el grupo con más aciertos!',
    },
    { x: 2.5, y: 3.85, w: W - 0.6 - 2.5, h: 2.8, size: 17, gap: 6 },
  );
}

// 12. 시상
{
  const s = frame(pres, meta());
  s.addText('AWARDS · 시상 · PREMIOS', { x: 0.6, y: 0.95, w: 8, h: 0.45, fontFace: F.latin, fontSize: 18, color: C.gold, charSpacing: 3 });
  const cw = 8.0, x = (W - cw) / 2, y = 1.6;
  s.addShape(pres.ShapeType.roundRect, { x, y, w: cw, h: 4.0, rectRadius: 0.15, fill: { color: C.gold }, line: { color: C.gold } });
  s.addImage({ path: asset('gift'), x: x + cw / 2 - 0.6, y: y + 0.3, w: 1.2, h: 1.2 });
  s.addText('Gift Cards', { x, y: y + 1.55, w: cw, h: 1.0, align: 'center', valign: 'middle', fontFace: F.latin, fontSize: 60, bold: true, color: C.pineDeep });
  s.addText(
    [
      { text: '우승 그룹 전원', options: { fontFace: F.ko, color: C.pineDeep, fontSize: 28, bold: true, breakLine: true } },
      { text: 'Winning group · Grupo ganador', options: { fontFace: F.latin, color: C.pineDeep, fontSize: 20 } },
    ],
    { x, y: y + 2.65, w: cw, h: 1.2, align: 'center', valign: 'top' },
  );
  trilingual(
    s,
    { ko: '우승 그룹에게 큰 박수!', en: 'A big round of applause for the winners!', es: '¡Un gran aplauso para los ganadores!' },
    { x: 0.6, y: 5.75, w: W - 1.2, h: 1.05, size: 16, gap: 0 },
  );
}

// 13. 마무리
{
  const s = frame(pres, meta());
  s.addText('CLOSING · 마무리 · CIERRE', { x: 0.6, y: 0.95, w: 8, h: 0.45, fontFace: F.latin, fontSize: 18, color: C.gold, charSpacing: 3 });
  headline(
    s,
    { ko: '복된 만남', en: 'Blessed Encounter', es: 'Encuentro Bendito' },
    { x: 0.6, y: 1.4, w: W - 1.2, scale: 1.1 },
  );
  s.addText('“거기서 내가 이스라엘 자손을 만나리니” — 출애굽기 29:43', {
    x: 0.6, y: 4.3, w: W - 1.2, h: 0.5, fontFace: F.ko, fontSize: 18, italic: true, color: C.goldSoft,
  });
  trilingual(
    s,
    {
      ko: '오늘 처음 이름을 알게 된 분이 있지요? 남은 수련회 동안, 그분에게 먼저 다가가 인사해 주세요.',
      en: 'You learned some new names tonight. For the rest of this retreat, go say hello to them first.',
      es: 'Esta noche aprendiste nombres nuevos. Durante el resto del retiro, ¡acércate tú primero a saludarlos!',
    },
    { x: 0.6, y: 4.95, w: W - 1.2, h: 1.8, size: 19, gap: 6 },
  );
}

if (n !== TOTAL) throw new Error(`slide count ${n} != TOTAL ${TOTAL}`);
const file = path.join(OUT, 'icebreaker-02-groupup.pptx');
await pres.writeFile({ fileName: file });
console.log('wrote', path.relative(ROOT, file));
