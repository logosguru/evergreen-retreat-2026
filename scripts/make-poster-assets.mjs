// 벽보 포스터용 이미지 자산 준비. 원본이 바뀌면 다시 돌린다.
//   node scripts/make-poster-assets.mjs
//
// 1) evergreen-logo-pine.png — 교회 로고(원본은 흰색, 어두운 사이트 헤더용)를 파인그린으로
//    틴트한 변형. 밝은 배경 포스터에서 흰 로고는 보이지 않기 때문.
//    알파 채널을 마스크로 써서 RGB만 교체 → 획 모양·안티에일리어싱은 원본 그대로.
//
// 티셔츠 엠블럼(public/retreat-emblem-2026.png)은 공모 당선작 원본을 그대로 쓴다.
// 배경 투명 · 남색 #203664 + 금색. 색을 임의로 바꾸지 않는다(당선작 훼손 금지) —
// 어두운 포스터에서는 아이보리 패널 위에 얹어 대비를 확보한다.

import path from "node:path";
import sharp from "sharp";

const PINE = [0x14, 0x34, 0x2b];
const SRC = path.join(process.cwd(), "public", "evergreen-logo.webp");
const OUT = path.join(process.cwd(), "public", "evergreen-logo-pine.png");

const { data, info } = await sharp(SRC)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

for (let i = 0; i < data.length; i += 4) {
  if (data[i + 3] === 0) continue; // 완전 투명 픽셀은 건드리지 않음
  data[i] = PINE[0];
  data[i + 1] = PINE[1];
  data[i + 2] = PINE[2];
}

await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
  .png()
  .toFile(OUT);

console.log(`evergreen-logo-pine.png  ${info.width}×${info.height}  (pine #14342b tint)`);
