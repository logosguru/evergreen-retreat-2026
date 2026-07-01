"use server";

import { createClient } from "@/lib/supabase/server";
import type { Language } from "@/lib/types";
import type { PersonInput } from "../register/actions";

// 회비 납부 토글 (관리자 전용). RLS + 클레임으로 관리자만 통과.
export async function setPaid(id: string, paid: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("attendees")
    .update({ paid, paid_at: paid ? new Date().toISOString() : null })
    .eq("id", id);
  return { ok: !error };
}

// 성도 언어 지정 (관리자 전용).
export async function setLanguage(id: string, language: Language) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("attendees")
    .update({ language })
    .eq("id", id);
  return { ok: !error };
}

export type AdminEditInput = PersonInput & {
  email?: string;
  language: Language;
  retreat_group?: string;
  is_group_leader?: boolean;
};

function clean(s?: string | null): string | null {
  const v = (s ?? "").trim();
  return v === "" ? null : v;
}

// 관리자 전체 편집(화이트리스트). admin은 RLS + guard 트리거 통과.
export async function adminUpdateAttendee(
  id: string,
  input: AdminEditInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!clean(input.korean_name) && !clean(input.english_name)) {
    return { ok: false, error: "validationName" };
  }
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
      korean_name: clean(input.korean_name),
      english_name: clean(input.english_name),
      district: clean(input.district),
      gender: input.gender ? input.gender : null,
      role: input.role ? input.role : "member",
      phone: clean(input.phone),
      email: clean(input.email),
      is_under_6: !!input.is_under_6,
      attendance: input.attendance,
      arrival_at:
        input.attendance === "partial" ? clean(input.arrival_at) : null,
      departure_at:
        input.attendance === "partial" ? clean(input.departure_at) : null,
      note: clean(input.note),
      language: input.language,
      retreat_group: clean(input.retreat_group),
      is_group_leader: !!input.is_group_leader,
    })
    .eq("id", id);

  if (error) return { ok: false, error: "updateError" };
  return { ok: true };
}

// 삭제(+가구주 승격은 RPC가 원자적으로 처리).
export async function adminDeleteAttendee(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_attendee", { target: id });
  if (error) return { ok: false, error: "deleteError" };
  return { ok: true };
}
