import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminAttendeeTable } from "@/components/AdminAttendeeTable";
import { EmailRequestBanner, type EmailRequest } from "@/components/EmailRequestBanner";
import {
  groupHouseholds,
  withHouseholdRoomType,
  paidByHead,
  householdBalance,
  type AttendeeWithRoom,
} from "@/lib/fees";

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
    .select(
      "*, rooms(label, room_types(name, price_per_person)), requested_room_type:room_types!requested_room_type_id(name, price_per_person)",
    )
    .order("district", { ascending: true, nullsFirst: false })
    .order("is_householder", { ascending: false })
    .order("created_at", { ascending: true });

  const raw = (data as AttendeeWithRoom[] | null) ?? [];
  const attendees = withHouseholdRoomType(raw);
  const households = groupHouseholds(attendees);
  const grandTotal = households.reduce((s, h) => s + h.total, 0);

  const { data: payData } = await supabase
    .from("fee_payments")
    .select("head_id, amount");
  const paid = paidByHead(
    (payData as { head_id: string; amount: number }[] | null) ?? [],
  );
  // 요약 통계: 수납 합계 + 정산 가구 수
  const collected = [...paid.values()].reduce((s, v) => s + v, 0);
  const settledHouseholds = households.filter(
    (h) => h.total > 0 && householdBalance(h.total, paid.get(h.head.id) ?? 0) <= 0,
  ).length;

  const { data: reqData } = await supabase
    .from("email_requests")
    .select("id, name_entered, email, phone, created_at")
    .eq("processed", false)
    .order("created_at", { ascending: true });
  const requests = (reqData as EmailRequest[] | null) ?? [];

  const t = await getTranslations("Admin");

  return (
    <div className="px-4 py-10 sm:px-6 lg:px-8">
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
        <span>{t("dashSettledHouseholds")}: {settledHouseholds}/{households.length}</span>
        <span>·</span>
        <span>${collected.toLocaleString("en-US")} / ${grandTotal.toLocaleString("en-US")}</span>
      </div>
      <div className="mt-6">
        <EmailRequestBanner requests={requests} />
      </div>
      <div className="mt-6">
        <AdminAttendeeTable
          attendees={attendees}
          paidByHead={Object.fromEntries(paid)}
        />
      </div>
    </div>
  );
}
