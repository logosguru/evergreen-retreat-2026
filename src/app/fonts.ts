import { Fraunces, Nanum_Myeongjo } from "next/font/google";
import localFont from "next/font/local";

// 영문 display: 따뜻하고 개성 있는 올드스타일 serif (진부한 Playfair 회피)
export const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-fraunces",
});

// 한글 display: 경건·우아한 명조. (Korean 서브셋은 next/font가 토큰으로 못 받아서 preload:false로 전체 로드)
export const myeongjo = Nanum_Myeongjo({
  weight: ["400", "700", "800"],
  preload: false,
  display: "swap",
  variable: "--font-myeongjo",
  // 자동 생성되는 "Nanum Myeongjo Fallback"(= local("Times New Roman"), unicode-range 없음)을
  // 끄려는 의도. ⚠️ 이 옵션은 webpack 폰트 로더만 처리하고 **Turbopack(Next 16 기본)은 무시**한다
  // (검증: 빌드 산출 CSS에 별칭이 그대로 남음). 그래서 실제 방어는 globals.css 의 display 스택에서
  // var(--font-myeongjo) 대신 "Nanum Myeongjo" 를 직접 써서 별칭을 배제하는 쪽으로 한다.
  // 여기 남겨두는 이유는 의도 표시 + webpack 으로 되돌릴 경우를 위해서다.
  adjustFontFallback: false,
});

// 본문(한/영): Pretendard 자체 호스팅 (지금까진 실제로 로딩 안 되고 있었음)
export const pretendard = localFont({
  src: "../../public/fonts/PretendardVariable.woff2",
  display: "swap",
  weight: "45 920",
  variable: "--font-pretendard",
});
