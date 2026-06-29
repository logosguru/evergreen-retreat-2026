import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AdminDashboard } from "@/components/AdminDashboard";
import { computeDashboard, type RoomForStats } from "@/lib/dashboard";
import type { AttendeeWithRoom } from "@/lib/fees";

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const [{ data: aData }, { data: rData }] = await Promise.all([
    supabase
      .from("attendees")
      .select("*, rooms(label, room_types(name, price_per_person))"),
    supabase.from("rooms").select("room_types(name, capacity)"),
  ]);

  const stats = computeDashboard(
    (aData as AttendeeWithRoom[] | null) ?? [],
    (rData as RoomForStats[] | null) ?? [],
  );

  const t = await getTranslations("Admin");

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{t("dashTitle")}</h1>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            {t("signOut")}
          </button>
        </form>
      </div>
      <div className="mt-6">
        <AdminDashboard stats={stats} />
      </div>
    </div>
  );
}
