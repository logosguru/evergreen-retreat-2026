import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { RoomManager } from "@/components/RoomManager";
import type { Room, RoomType } from "@/lib/types";

export default async function RoomsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const [{ data: roomTypes }, { data: rooms }] = await Promise.all([
    supabase.from("room_types").select("*").order("sort_order"),
    supabase.from("rooms").select("*").order("sort_order"),
  ]);

  const t = await getTranslations("Rooms");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">{t("title")}</h1>
      <RoomManager
        roomTypes={(roomTypes as RoomType[] | null) ?? []}
        rooms={(rooms as Room[] | null) ?? []}
      />
    </div>
  );
}
