"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: boolean };

export async function upsertScheduleItem(input: {
  id?: string;
  day: string;
  start_time: string;
  title: string;
  description?: string | null;
  location?: string | null;
  sort_order?: number;
}): Promise<Result> {
  const supabase = await createClient();
  const row = {
    day: input.day,
    start_time: input.start_time,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    location: input.location?.trim() || null,
    sort_order: input.sort_order ?? 0,
  };
  const { error } = input.id
    ? await supabase.from("schedule_items").update(row).eq("id", input.id)
    : await supabase.from("schedule_items").insert(row);
  revalidatePath("/[locale]/admin/schedule", "page");
  revalidatePath("/[locale]/schedule", "page");
  return { ok: !error };
}

export async function deleteScheduleItem(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("schedule_items").delete().eq("id", id);
  revalidatePath("/[locale]/admin/schedule", "page");
  revalidatePath("/[locale]/schedule", "page");
  return { ok: !error };
}
