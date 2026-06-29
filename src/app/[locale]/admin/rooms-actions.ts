"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: boolean };

export async function upsertRoomType(input: {
  id?: string;
  name: string;
  capacity: number;
  price_per_person: number;
  sort_order?: number;
}): Promise<Result> {
  const supabase = await createClient();
  const row = {
    name: input.name.trim(),
    capacity: input.capacity,
    price_per_person: input.price_per_person,
    sort_order: input.sort_order ?? 0,
  };
  const { error } = input.id
    ? await supabase.from("room_types").update(row).eq("id", input.id)
    : await supabase.from("room_types").insert(row);
  revalidatePath("/[locale]/admin/rooms", "page");
  return { ok: !error };
}

export async function deleteRoomType(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("room_types").delete().eq("id", id);
  revalidatePath("/[locale]/admin/rooms", "page");
  return { ok: !error };
}

export async function upsertRoom(input: {
  id?: string;
  label: string;
  room_type_id: string;
  note?: string;
  sort_order?: number;
}): Promise<Result> {
  const supabase = await createClient();
  const row = {
    label: input.label.trim(),
    room_type_id: input.room_type_id,
    note: input.note?.trim() || null,
    sort_order: input.sort_order ?? 0,
  };
  const { error } = input.id
    ? await supabase.from("rooms").update(row).eq("id", input.id)
    : await supabase.from("rooms").insert(row);
  revalidatePath("/[locale]/admin/rooms", "page");
  return { ok: !error };
}

export async function deleteRoom(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("rooms").delete().eq("id", id);
  revalidatePath("/[locale]/admin/rooms", "page");
  return { ok: !error };
}
