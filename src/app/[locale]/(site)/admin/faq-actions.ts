"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: boolean };

export async function upsertFaq(input: {
  id?: string;
  question: string;
  question_en?: string | null;
  question_es?: string | null;
  answer: string;
  answer_en?: string | null;
  answer_es?: string | null;
  sort_order?: number;
}): Promise<Result> {
  const supabase = await createClient();
  const row = {
    question: input.question.trim(),
    question_en: input.question_en?.trim() || null,
    question_es: input.question_es?.trim() || null,
    answer: input.answer.trim(),
    answer_en: input.answer_en?.trim() || null,
    answer_es: input.answer_es?.trim() || null,
    sort_order: input.sort_order ?? 0,
  };
  const { error } = input.id
    ? await supabase.from("faqs").update(row).eq("id", input.id)
    : await supabase.from("faqs").insert(row);
  revalidatePath("/[locale]/admin/faq", "page");
  revalidatePath("/[locale]/faq", "page");
  return { ok: !error };
}

export async function deleteFaq(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("faqs").delete().eq("id", id);
  revalidatePath("/[locale]/admin/faq", "page");
  revalidatePath("/[locale]/faq", "page");
  return { ok: !error };
}
