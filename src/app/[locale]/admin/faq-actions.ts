"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: boolean };

export async function upsertFaq(input: {
  id?: string;
  question: string;
  answer: string;
  sort_order?: number;
}): Promise<Result> {
  const supabase = await createClient();
  const row = {
    question: input.question.trim(),
    answer: input.answer.trim(),
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
