// 이름표 뒷면에 인쇄할 언어별 일정 QR 코드 생성.
//   npm run qr                                   → 프로덕션 URL
//   QR_BASE_URL=http://localhost:3000 npm run qr → 로컬 확인용
//
// 출력 (public/qr/):
//   schedule-{ko,en,es}.svg          라벨 없음 · 벡터 (라벨을 직접 디자인할 때)
//   schedule-{ko,en,es}.png          라벨 없음 · 1200px
//   schedule-{ko,en,es}-labeled.png  QR 아래 언어명 · 인쇄용 (세 장을 구분하기 쉬움)
//
// 라벨은 국기 대신 언어 이름을 쓴다 — 스페인어·영어는 특정 국가에 매이지 않고,
// 각 언어 자체 표기가 오해 없이 가장 잘 통한다.
// 라벨 버전은 PNG만 만든다: SVG <text> 는 인쇄처에 한글 폰트가 없으면 깨지므로
// 글자를 픽셀로 구워 넣는다.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import sharp from "sharp";

const BASE_URL = (
  process.env.QR_BASE_URL ?? "https://retreat.nyevergreen.com"
).replace(/\/+$/, "");

// localePrefix: 'as-needed' — 기본 로케일(ko)만 prefix 없음
const TARGETS = [
  { locale: "ko", label: "한국어", pathname: "/schedule" },
  { locale: "en", label: "English", pathname: "/en/schedule" },
  { locale: "es", label: "Español", pathname: "/es/schedule" },
];

const OUT_DIR = path.join(process.cwd(), "public", "qr");

const PINE = "#14342b"; // 브랜드 딥 그린. 사실상 검정에 가까워 스캔 신뢰도를 해치지 않는다.

// 인쇄 시 종이 질감·잉크 번짐을 견디도록 오류 정정 레벨 Q(25% 복원).
// margin 4 = QR 규격이 요구하는 최소 여백(quiet zone) 4모듈을 이미지 안에 포함.
const QR_OPTIONS = {
  errorCorrectionLevel: "Q",
  margin: 4,
  color: { dark: `${PINE}ff`, light: "#ffffffff" },
};

const QR_PX = 1200; // 라벨 버전의 QR 변 길이
const SIDE_PAD = 70; // QR 좌우 여백 (규격 여백에 더해지는 추가 흰 공간)
const LABEL_GAP = 56; // QR 아래 ~ 글자 위 (규격 여백 4모듈에 더해짐)
const LABEL_SIZE = 132; // 글자 크기
const BOTTOM_PAD = 64;

// 한글·라틴 악센트를 모두 커버하는 시스템 폰트 스택 (librsvg/fontconfig가 해석)
const FONT_STACK =
  "'Apple SD Gothic Neo', 'Pretendard', 'Noto Sans KR', 'Malgun Gothic', 'Helvetica Neue', Arial, sans-serif";

// XML 텍스트 노드에 안전하게 넣기 (라벨에 &, < 등이 들어와도 깨지지 않게)
function escapeXml(s) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c],
  );
}

// QR + 아래 언어명을 한 장의 PNG로 합성
async function buildLabeledPng(url, label, outPath) {
  const qr = await sharp(
    await QRCode.toBuffer(url, { ...QR_OPTIONS, type: "png", width: QR_PX }),
  )
    .png()
    .toBuffer();

  const width = QR_PX + SIDE_PAD * 2;
  const labelBlock = LABEL_GAP + LABEL_SIZE + BOTTOM_PAD;
  const height = QR_PX + labelBlock;

  // 글자 베이스라인: 블록 시작 + gap + 글자 크기의 약 80%(캡 높이 기준 시각 정렬)
  const baseline = QR_PX + LABEL_GAP + Math.round(LABEL_SIZE * 0.8);
  const textSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<text x="${width / 2}" y="${baseline}" text-anchor="middle" ` +
      `font-family="${FONT_STACK}" font-size="${LABEL_SIZE}" font-weight="700" ` +
      `fill="${PINE}">${escapeXml(label)}</text></svg>`,
  );

  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      { input: qr, top: 0, left: SIDE_PAD },
      { input: textSvg, top: 0, left: 0 },
    ])
    .png()
    .toFile(outPath);

  return { width, height };
}

await mkdir(OUT_DIR, { recursive: true });

for (const { locale, label, pathname } of TARGETS) {
  const url = `${BASE_URL}${pathname}`;
  const base = path.join(OUT_DIR, `schedule-${locale}`);

  await writeFile(
    `${base}.svg`,
    await QRCode.toString(url, { ...QR_OPTIONS, type: "svg" }),
  );
  await QRCode.toFile(`${base}.png`, url, {
    ...QR_OPTIONS,
    type: "png",
    width: QR_PX,
  });
  const { width, height } = await buildLabeledPng(url, label, `${base}-labeled.png`);

  console.log(`${label.padEnd(8)} ${url}`);
  console.log(
    `         → schedule-${locale}.svg · .png (라벨 없음) · -labeled.png (${width}×${height})`,
  );
}
