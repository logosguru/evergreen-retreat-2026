"use server";

import { createClient } from "@/lib/supabase/server";
import { clean, rowFor, validatePerson } from "@/lib/attendee-rows";
import type { PersonInput } from "@/lib/attendee-rows";
import { verifyTurnstile } from "@/lib/turnstile";

// NOTE: "use server" 파일에서 `export type { PersonInput }`(bare 재수출 지정자)는
// turbopack action 변환이 값으로 오인해 registerServerReference로 등록 → 런타임
// ReferenceError. PersonInput 소비자는 @/lib/attendee-rows/register-actions에서 import.
export type EditResult = { ok: true } | { ok: false; error: string };

// 본인 가구에 비-가구주 멤버 1명 추가. head는 my_household_head_ids로 검증(클라이언트 신뢰 안 함).
// 성공 시 생성한 행 id를 반환해 클라이언트가 목록에 즉시(낙관적) 반영할 수 있게 한다.
export async function addMyMember(
  input: PersonInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (validatePerson(input)) return { ok: false, error: "validationName" };
  const supabase = await createClient();
  const { data: headData } = await supabase.rpc("my_household_head_ids");
  const headId = ((headData as string[] | null) ?? [])[0];
  if (!headId) return { ok: false, error: "updateError" };
  const id = crypto.randomUUID();
  const { error } = await supabase.from("attendees").insert(
    rowFor(input, {
      id,
      is_householder: false,
      email: null,
      householder_id: headId,
    }),
  );
  if (error) return { ok: false, error: "updateError" };
  return { ok: true, id };
}

// 본인 가구의 비-가구주 멤버 삭제 (RPC가 head/타 가구 거부).
export async function removeMyMember(memberId: string): Promise<EditResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_my_member", {
    member_id: memberId,
  });
  if (error) return { ok: false, error: "updateError" };
  return { ok: true };
}

// 본인(또는 가구 구성원) 행 수정. RLS가 본인 가구 행만 허용하고,
// guard_privileged_cols 트리거가 paid/retreat_group/is_group_leader 변경을 되돌린다.
// 여기서도 화이트리스트 컬럼만 보낸다 (관리자 전용 컬럼 미포함).
export async function updateMyAttendee(
  id: string,
  input: PersonInput,
): Promise<EditResult> {
  if (!clean(input.korean_name) && !clean(input.english_name))
    return { ok: false, error: "validationName" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("attendees")
    .update({
      korean_name: clean(input.korean_name),
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

// 본인 가구의 객실 타입 선택(가구주 행). 납부 여부와 무관하게 변경 허용(차액은 원장/잔액으로 정산).
export async function updateMyRoomType(
  roomTypeId: string | null,
): Promise<EditResult> {
  const supabase = await createClient();
  const { data: headData } = await supabase.rpc("my_household_head_ids");
  const headId = ((headData as string[] | null) ?? [])[0];
  if (!headId) return { ok: false, error: "updateError" };
  const { error } = await supabase
    .from("attendees")
    .update({ requested_room_type_id: roomTypeId })
    .eq("id", headId);
  if (error) return { ok: false, error: "updateError" };
  return { ok: true };
}
