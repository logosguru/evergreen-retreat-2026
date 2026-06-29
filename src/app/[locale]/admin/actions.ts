"use server";

import { createClient } from "@/lib/supabase/server";
import type { Language } from "@/lib/types";

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
