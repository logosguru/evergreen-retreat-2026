"use server";

import { createClient } from "@/lib/supabase/server";
import type { PersonInput } from "../register/actions";
import { verifyTurnstile } from "@/lib/turnstile";

export type EditResult = { ok: true } | { ok: false; error: string };

function clean(s?: string | null): string | null {
  const v = (s ?? "").trim();
  return v === "" ? null : v;
}

// 본인(또는 가구 구성원) 행 수정. RLS가 본인 가구 행만 허용하고,
// guard_privileged_cols 트리거가 paid/retreat_group/is_group_leader 변경을 되돌린다.
// 여기서도 화이트리스트 컬럼만 보낸다 (관리자 전용 컬럼 미포함).
export async function updateMyAttendee(
  id: string,
  input: PersonInput,
): Promise<EditResult> {
  if (!clean(input.korean_name)) return { ok: false, error: "validationName" };
  if (
    input.attendance === "partial" &&
    (!clean(input.arrival_at) || !clean(input.departure_at))
  ) {
    return { ok: false, error: "validationPartial" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("attendees")
    .update({
      korean_name: clean(input.korean_name)!,
      english_name: clean(input.english_name),
      district: clean(input.district),
      gender: input.gender ? input.gender : null,
      role: input.role ? input.role : "member",
      phone: clean(input.phone),
      is_under_6: !!input.is_under_6,
      attendance: input.attendance,
      arrival_at: input.attendance === "partial" ? clean(input.arrival_at) : null,
      departure_at:
        input.attendance === "partial" ? clean(input.departure_at) : null,
      note: clean(input.note),
    })
    .eq("id", id);

  if (error) return { ok: false, error: "updateError" };
  return { ok: true };
}

export type RequestLinkResult = { ok: true } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 매직링크 발송을 서버에서 처리해 Turnstile 서버 검증을 강제한다.
// emailRedirectTo의 origin은 클라이언트가 전달(Supabase Redirect 허용목록이 최종 검증).
export async function requestEditMagicLink(params: {
  email: string;
  turnstileToken: string | null;
  origin: string;
}): Promise<RequestLinkResult> {
  if (!(await verifyTurnstile(params.turnstileToken))) {
    return { ok: false, error: "captchaFailed" };
  }
  const email = clean(params.email);
  if (!email || !EMAIL_RE.test(email)) {
    return { ok: false, error: "validationEmail" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${params.origin}/auth/confirm?next=/edit/manage`,
    },
  });
  if (error) return { ok: false, error: "sendError" };
  return { ok: true };
}
