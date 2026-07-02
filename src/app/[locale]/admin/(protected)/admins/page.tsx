import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AdminsManager, type AdminRow } from "@/components/AdminsManager";

export default async function AdminAdminsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  // admins_all_admin RLS: 관리자만 조회 가능.
  const { data } = await supabase
    .from("admins")
    .select("id, email, name, created_at")
    .order("created_at", { ascending: true });
  const admins = (data as AdminRow[] | null) ?? [];

  // 본인 행 보호(자기 삭제 방지)용 현재 세션 이메일
  const { data: claimsData } = await supabase.auth.getClaims();
  const currentEmail = (claimsData?.claims?.email as string | undefined) ?? null;

  const t = await getTranslations("Admin");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">{t("adminsTitle")}</h1>
      <p className="mt-2 text-sm text-slate-600">
        {t("adminsCount", { count: admins.length })}
      </p>
      <div className="mt-6">
        <AdminsManager admins={admins} currentEmail={currentEmail} />
      </div>
    </div>
  );
}
