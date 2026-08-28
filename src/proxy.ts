import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16: 미들웨어는 proxy.ts / proxy() 로 명명한다.
// next-intl 로케일 라우팅을 먼저 처리한 뒤, 그 응답에 Supabase 세션 갱신 쿠키를 얹는다.
const handleI18nRouting = createMiddleware(routing);

// 이름표 QR로 인쇄되는 한국어 일정 링크. localePrefix: 'as-needed' 라 prefix가 없어서
// 그대로 두면 next-intl 의 브라우저 언어 감지(accept-language)에 걸려 /en/schedule 로
// 리다이렉트된다 — 인쇄된 QR이 약속한 언어와 달라지므로 로케일을 ko로 고정한다.
// (/en/schedule · /es/schedule 은 prefix가 명시적이라 감지보다 우선하므로 손댈 필요 없음)
const KO_SCHEDULE_PATHS = new Set(["/schedule", "/schedule/"]);

export async function proxy(request: NextRequest) {
  if (KO_SCHEDULE_PATHS.has(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = `/${routing.defaultLocale}/schedule`;
    const response = NextResponse.rewrite(url);
    // 이 QR로 들어온 사람은 이후 사이트 이동도 한국어로 — next-intl이 읽는 쿠키를 맞춰준다.
    response.cookies.set("NEXT_LOCALE", routing.defaultLocale, {
      path: "/",
      maxAge: 31536000,
      sameSite: "lax",
    });
    return updateSession(request, response);
  }

  const response = handleI18nRouting(request);
  return updateSession(request, response);
}

export const config = {
  // _next 내부, 정적 파일(점 포함), api, auth(로케일 무관 콜백) 제외
  matcher: ["/((?!api|auth|_next/static|_next/image|.*\\..*).*)"],
};
