// 이름표 뒷면에 인쇄할 언어별 일정 QR 코드 생성.
//   npm run qr                                  → 프로덕션 URL
//   QR_BASE_URL=http://localhost:3000 npm run qr → 로컬 확인용
//
// 출력: public/qr/schedule-{ko,en,es}.svg (벡터, 인쇄 권장) + .png (1200px)
// 언어 라벨은 이미지에 넣지 않는다 — 이름표 디자인에서 붙이는 편이 자유롭다.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";

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

// 인쇄 시 종이 질감·잉크 번짐을 견디도록 오류 정정 레벨 Q(25% 복원).
// 색은 브랜드 파인 그린 — 사실상 검정에 가까워 스캔 신뢰도를 해치지 않는다.
const OPTIONS = {
  errorCorrectionLevel: "Q",
  margin: 2,
  color: { dark: "#14342bff", light: "#ffffffff" },
};

await mkdir(OUT_DIR, { recursive: true });

for (const { locale, label, pathname } of TARGETS) {
  const url = `${BASE_URL}${pathname}`;
  const base = path.join(OUT_DIR, `schedule-${locale}`);

  const svg = await QRCode.toString(url, { ...OPTIONS, type: "svg" });
  await writeFile(`${base}.svg`, svg);
  await QRCode.toFile(`${base}.png`, url, { ...OPTIONS, type: "png", width: 1200 });

  console.log(`${label.padEnd(8)} ${url}`);
  console.log(`         → public/qr/schedule-${locale}.svg, .png`);
}
