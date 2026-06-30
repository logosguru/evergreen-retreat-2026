import { createClient } from "@/lib/supabase/server";

// Supabase 무료 티어 7일 무활동 정지 방지용 keep-alive.
// Vercel Cron은 CRON_SECRET 설정 시 Authorization: Bearer 헤더를 자동 전송한다.
// 공개읽기(RLS) 테이블 faqs를 가볍게 head-count 하여 DB 활동을 발생시킨다.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("faqs")
    .select("id", { head: true, count: "exact" });

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
