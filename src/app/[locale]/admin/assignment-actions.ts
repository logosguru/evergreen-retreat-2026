"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function assignRoom(
  attendeeId: string,
  roomId: string | null,
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("attendees")
    .update({ room_id: roomId })
    .eq("id", attendeeId);
  revalidatePath("/[locale]/admin/assignments", "page");
  return { ok: !error };
}
