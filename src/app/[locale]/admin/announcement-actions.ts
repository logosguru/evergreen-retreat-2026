"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: boolean };

export async function upsertAnnouncement(input: {
  id?: string;
  title: string;
  body: string;
  pinned?: boolean;
  published?: boolean;
}): Promise<Result> {
  const supabase = await createClient();
  const row = {
    title: input.title.trim(),
    body: input.body.trim(),
    pinned: input.pinned ?? false,
    published: input.published ?? true,
  };
  const { error } = input.id
    ? await supabase.from("announcements").update(row).eq("id", input.id)
    : await supabase.from("announcements").insert(row);
  revalidatePath("/[locale]/admin/announcements", "page");
  revalidatePath("/[locale]/announcements", "page");
  return { ok: !error };
}

export async function deleteAnnouncement(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("announcements").delete().eq("id", id);
  revalidatePath("/[locale]/admin/announcements", "page");
  revalidatePath("/[locale]/announcements", "page");
  return { ok: !error };
}

export async function toggleAnnouncementFlag(
  id: string,
  field: "pinned" | "published",
  value: boolean,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("announcements")
    .update({ [field]: value })
    .eq("id", id);
  revalidatePath("/[locale]/admin/announcements", "page");
  revalidatePath("/[locale]/announcements", "page");
  return { ok: !error };
}
