import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

// proxy(미들웨어)에서 Supabase 세션 토큰을 갱신하고,
// 갱신된 쿠키를 전달받은 응답(next-intl 응답)에 복사한다.
export async function updateSession(
  request: NextRequest,
  response: NextResponse,
) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // 토큰 갱신 + JWT 검증. createServerClient와 이 호출 사이에 로직을 넣지 말 것.
  await supabase.auth.getClaims();

  return response;
}
