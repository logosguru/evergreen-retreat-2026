import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AdminAttendeeTable } from "@/components/AdminAttendeeTable";
import type { Attendee } from "@/lib/types";

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  // 관리자 RLS → 전체 조회. 가구주 → 가족 순으로 그룹화 정렬.
  const { data } = await supabase
    .from("attendees")
    .select("*")
    .order("district", { ascending: true, nullsFirst: false })
    .order("is_householder", { ascending: false })
    .order("created_at", { ascending: true });

  const attendees = (data as Attendee[] | null) ?? [];
  const paidCount = attendees.filter((a) => a.paid).length;

  const t = await getTranslations("Admin");

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            {t("signOut")}
          </button>
        </form>
      </div>
      <div className="mt-2 flex gap-4 text-sm text-slate-600">
        <span>{t("total", { count: attendees.length })}</span>
        <span>·</span>
        <span>{t("paidCount", { count: paidCount })}</span>
      </div>
      <div className="mt-6">
        <AdminAttendeeTable attendees={attendees} />
      </div>
    </div>
  );
}
