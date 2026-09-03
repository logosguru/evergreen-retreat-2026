---
name: print-assets
description: 벽보 포스터(/schedule/poster)·이름표 QR·인쇄 PDF·폰트 스택(next/font 폴백 함정, 언어별 제목 폰트) 작업 시 규칙과 검증 방법
---

# 인쇄물 · 폰트 규칙

## 폰트
- **폰트 스택에 next/font 변수를 그대로 쓰면 안 되는 경우가 있다.** `var(--font-myeongjo)` 는
  `"Nanum Myeongjo", "Nanum Myeongjo Fallback"` 로 펼쳐진다. 뒤의 별칭은 next/font 가 CLS 완화용으로
  자동 생성한 `local("Times New Roman")` 이고 **`unicode-range` 가 없어** 명조에 없는 글리프(á í ñ …)를
  전부 가로챈다. `font-weight` 서술자도 없어 굵은 제목에서 **합성 볼드**가 걸려 그 한 글자만 튄다
  (스페인어 `sáb` 의 `á` 사례). 그래서 `--font-display*` 스택은 실제 패밀리명 `"Nanum Myeongjo"` 를
  직접 쓴다. `adjustFontFallback: false` 는 **Turbopack 이 무시**하므로(webpack 로더 전용) 믿지 말 것.
- **제목 폰트는 문서 언어에 따라 갈린다.** `font-display-ko`(명조 우선)는 한국어에서 숫자·괄호까지
  한글과 같은 명조로 붙이기 위한 스택이고, `html[lang="en"|"es"]` 에서는 globals.css 가 라틴 우선
  (`--font-display` 순서)으로 뒤집는다. `@theme inline` 이라 유틸리티가 값을 인라인하므로
  **변수 재정의로는 안 되고 클래스를 덮어써야** 한다. 검증은 Playwright + CDP
  `CSS.getPlatformFontsForNode` 로 글자별 실제 폰트를 세는 것이 확실하다(Times New Roman 이 0이어야 함).

## 벽보 포스터 / QR
- **벽보 포스터(`/schedule/poster`)는 18×24in 세로, `?theme=light|dark` 두 버전.**
  `light` 는 색 면을 쓰지 않아 '배경 그래픽' 체크 없이도 그대로 나온다(기본·권장).
  `dark` 는 사이트 테마(파인그린 바탕)로 **배경 인쇄가 필수** — 페이지 상단에 경고를 띄운다.
  `@page { margin: 0 }` + 포스터 안쪽 padding 으로 **full bleed** 처리(어두운 배경이 종이 끝까지).
  색은 `--paper/--ink/--ink-2/--ink-3/--accent/--hair` 의미 토큰으로만 쓰고 `.theme-dark` 에서 값만 교체.
  QR 은 어두운 테마에서도 흰 바탕을 유지해야 스캔된다(`.qr img { background:#fff }`).
  한글은 아무 곳에서나 꺾이므로 루트에 `word-break: keep-all`.
  `@page { size: 18in 24in }` 는 선택자로 범위를 못 잡으므로 **globals.css 에 두지 말 것**
  (모든 인쇄, 특히 `/admin/schedule` 실무용 표의 용지가 바뀐다) — 포스터 컴포넌트 안의 `<style>` 로만 넣는다.
  항목 블록은 하루 최대 개수에 따라 `--u` 로 자동 축소해 일정이 늘어도 한 장을 유지한다.
  검증은 Playwright `page.pdf()`(margin 0, printBackground) 로 실제 PDF를 만들어
  **페이지 수 1 · 정확히 18×24in · 잘린 텍스트 0 · 200dpi 렌더에서 QR 디코딩**을 두 테마 모두 확인.
- **포스터 이미지 자산**: 교회 로고 원본(`evergreen-logo.webp`)은 **흰색**이라 밝은 배경에서 안 보인다 →
  `scripts/make-poster-assets.mjs` 로 파인그린 틴트 변형(`evergreen-logo-pine.png`)을 만들어 라이트에 쓴다.
  티셔츠 엠블럼(`retreat-emblem-2026.png`, 공모 당선작)은 남색+금색이라 어두운 바탕에서 묻히므로
  **색을 바꾸지 않고 아이보리 원형 패널 위에 얹는다**(당선작 훼손 금지).
- **`by_language` 항목은 언어별로 실제 세션이 다르다** (성경공부: ko `Conference Room` / en `Pacific Ballroom`,
  강사도 다름). 이중언어 벽보는 `lib/poster.ts` 의 `bilingual()` 로 양쪽을 모두 표기해야 한다 —
  "나는 어디로 가나"가 벽 일정표의 존재 이유다.
- **QR 라벨은 국기 대신 언어 이름**(한국어/English/Español). 스페인어·영어는 특정 국가에 매이지 않는다.
  라벨 버전은 **PNG만** 만든다 — SVG `<text>`는 인쇄처에 한글 폰트가 없으면 깨지므로 글자를 픽셀로 굽는다
  (sharp + fontconfig). QR 이미지를 손대면 **반드시 디코딩 재검증**할 것(축소 180px까지 통과 확인 완료).
- QR 파일: `public/qr/schedule-{ko,en,es}.svg|.png`(라벨 없음, 벡터/1200px) · `-labeled.png`(언어명 라벨, 인쇄용 기본).
  전부 커밋됨. URL 바뀌면 `npm run qr` 재생성 + 디코딩 재확인.
