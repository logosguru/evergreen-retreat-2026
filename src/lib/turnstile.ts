// Cloudflare Turnstile 서버 검증.
// TURNSTILE_SECRET_KEY 미설정 시 스킵(true) — 로컬/테스트 친화.
// 키가 있으면 토큰 없음/siteverify 실패/네트워크 오류 모두 차단(false, fail-closed).
const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(token: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // 키 미설정 → 스킵
  if (!token) return false; // 키 있는데 토큰 없음 → 차단

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false; // 네트워크/파싱 오류 → fail-closed
  }
}
