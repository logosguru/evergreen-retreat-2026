import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16: 미들웨어는 proxy.ts / proxy() 로 명명한다.
// next-intl 로케일 라우팅을 먼저 처리한 뒤, 그 응답에 Supabase 세션 갱신 쿠키를 얹는다.
const handleI18nRouting = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  const response = handleI18nRouting(request);
  return updateSession(request, response);
}

export const config = {
  // _next 내부, 정적 파일(점 포함), api, auth(로케일 무관 콜백) 제외
  matcher: ["/((?!api|auth|_next/static|_next/image|.*\\..*).*)"],
};
