import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminNewAttendeeForm } from "@/components/AdminNewAttendeeForm";

export default async function AdminNewAttendeePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Admin");

  // 개인 모드에서 기존 가구에 붙일 수 있도록 가구주 후보 목록 조회.
  const supabase = await createClient();
  const { data: headRows } = await supabase
    .from("attendees")
    .select("id, korean_name, english_name")
    .eq("is_householder", true)
    .order("korean_name", { ascending: true, nullsFirst: false });
  const heads = headRows ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link
        href="/admin/attendees"
        className="text-sm text-slate-500 hover:text-slate-900"
      >
        {t("backToList")}
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">
        {t("addAttendee")}
      </h1>
      <div className="mt-6">
        <AdminNewAttendeeForm heads={heads} />
      </div>
    </div>
  );
}
