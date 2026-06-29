import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AssignmentBoard } from "@/components/AssignmentBoard";
import type { Room, RoomType } from "@/lib/types";
import type { AttendeeWithRoom } from "@/lib/fees";

export default async function AssignmentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const [{ data: rooms }, { data: attendees }] = await Promise.all([
    supabase
      .from("rooms")
      .select("*, room_types(*)")
      .order("sort_order"),
    supabase
      .from("attendees")
      .select("*, rooms(label, room_types(name, price_per_person))")
      .order("is_householder", { ascending: false })
      .order("created_at"),
  ]);

  const t = await getTranslations("Rooms");

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">
        {t("assignments")}
      </h1>
      <AssignmentBoard
        rooms={(rooms as (Room & { room_types: RoomType })[] | null) ?? []}
        attendees={(attendees as AttendeeWithRoom[] | null) ?? []}
      />
    </div>
  );
}
