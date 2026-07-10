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
});

// 본문(한/영): Pretendard 자체 호스팅 (지금까진 실제로 로딩 안 되고 있었음)
export const pretendard = localFont({
  src: "../../public/fonts/PretendardVariable.woff2",
  display: "swap",
  weight: "45 920",
  variable: "--font-pretendard",
});
