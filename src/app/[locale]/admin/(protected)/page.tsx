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
  const [{ data: aData }, { data: rData }, { count: reqCount }] =
    await Promise.all([
      supabase
        .from("attendees")
        .select("*, rooms(label, room_types(name, price_per_person))"),
      supabase.from("rooms").select("room_types(name, capacity)"),
      supabase
        .from("email_requests")
        .select("id", { count: "exact", head: true })
        .eq("processed", false),
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
      {(reqCount ?? 0) > 0 && (
        <div className="mt-6 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            {t("dashEmailRequests")}
          </p>
          <p className="mt-1 text-2xl font-bold text-amber-800">{reqCount}</p>
        </div>
      )}
      <div className="mt-6">
        <AdminDashboard stats={stats} />
      </div>
    </div>
  );
}
