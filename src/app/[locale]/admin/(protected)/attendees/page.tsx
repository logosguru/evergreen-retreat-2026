import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminAttendeeTable } from "@/components/AdminAttendeeTable";
import { groupHouseholds, type AttendeeWithRoom } from "@/lib/fees";

export default async function AdminAttendeesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data } = await supabase
    .from("attendees")
    .select("*, rooms(label, room_types(name, price_per_person))")
    .order("district", { ascending: true, nullsFirst: false })
    .order("is_householder", { ascending: false })
    .order("created_at", { ascending: true });

  const attendees = (data as AttendeeWithRoom[] | null) ?? [];
  const households = groupHouseholds(attendees);
  const grandTotal = households.reduce((s, h) => s + h.total, 0);
  const paidHouseholds = households.filter((h) => h.head.paid).length;

  const t = await getTranslations("Admin");

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
        <Link
          href="/admin/attendees/new"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          + {t("addAttendee")}
        </Link>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-600">
        <span>{t("total", { count: attendees.length })}</span>
        <span>·</span>
        <span>{t("paidCount", { count: paidHouseholds })}</span>
        <span>·</span>
        <span>${grandTotal.toLocaleString("en-US")}</span>
      </div>
      <div className="mt-6">
        <AdminAttendeeTable attendees={attendees} />
      </div>
    </div>
  );
}
