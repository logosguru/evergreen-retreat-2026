#!/usr/bin/env sh
# pptx → PDF → 슬라이드별 PNG (검증용). 사용: sh scripts/icebreaker/render.sh out/icebreaker/icebreaker-01-rps.pptx
# LibreOffice(brew cask) 는 macOS 사용자 폰트를 헤드리스에서 못 보므로, 전용 프로필의 user/fonts 에
# ~/Library/Fonts 를 복사해 넣어 Fraunces / Nanum Myeongjo / Noto Sans KR / Noto Color Emoji 를 인식시킨다.
set -e
PPTX="$1"; DIR="$(dirname "$PPTX")/render"; rm -rf "$DIR"; mkdir -p "$DIR"
PROFILE="$(dirname "$PPTX")/.lo-profile"; mkdir -p "$PROFILE/user/fonts"
cp -f "$HOME"/Library/Fonts/*.ttf "$PROFILE/user/fonts/" 2>/dev/null || true
/Applications/LibreOffice.app/Contents/MacOS/soffice -env:UserInstallation="file://$(cd "$PROFILE" && pwd)" \
  --headless --convert-to pdf --outdir "$DIR" "$PPTX" >/dev/null 2>&1
pdftoppm -r 60 -png "$DIR"/*.pdf "$DIR/s" 2>/dev/null
ls "$DIR"
