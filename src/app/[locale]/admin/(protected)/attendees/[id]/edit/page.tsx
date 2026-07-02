import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminEditForm } from "@/components/AdminEditForm";
import { displayName } from "@/lib/names";
import type { Attendee } from "@/lib/types";

export default async function AdminEditAttendeePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data: attendee } = await supabase
    .from("attendees")
    .select("*")
    .eq("id", id)
    .single();

  if (!attendee) notFound();
  const a = attendee as Attendee;

  // 가구주 재지정 후보: 본인을 제외한 모든 가구주(개인 포함 — 모든 개인은 1인 가구주)
  const { data: headRows } = await supabase
    .from("attendees")
    .select("id, korean_name, english_name")
    .eq("is_householder", true)
    .neq("id", a.id)
    .order("korean_name", { ascending: true, nullsFirst: false });
  const heads = headRows ?? [];

  // 이 참석자가 관리자(admins allowlist)인지 + 본인(현재 로그인) 여부 판단용 이메일
  let isAttendeeAdmin = false;
  if (a.email) {
    const { data: adminRow } = await supabase
      .from("admins")
      .select("email")
      .ilike("email", a.email)
      .maybeSingle();
    isAttendeeAdmin = !!adminRow;
  }
  const { data: claimsData } = await supabase.auth.getClaims();
  const currentEmail = (claimsData?.claims?.email as string | undefined) ?? null;

  // 읽기전용 가구 맥락
  const headId = a.is_householder ? a.id : a.householder_id;
  let household: Pick<Attendee, "id" | "korean_name" | "english_name" | "is_householder">[] = [];
  if (headId) {
    const { data } = await supabase
      .from("attendees")
      .select("id, korean_name, english_name, is_householder")
      .or(`id.eq.${headId},householder_id.eq.${headId}`)
      .order("is_householder", { ascending: false });
    household = data ?? [];
  }

  const t = await getTranslations("Admin");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/admin/attendees" className="text-sm text-slate-500 hover:text-slate-900">
        {t("backToList")}
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">
        {t("editTitle")} — {displayName(a)}
      </h1>

      {household.length > 1 && (
        <p className="mt-2 text-sm text-slate-500">
          {t("householdLabel")}:{" "}
          {household
            .map((m) => displayName(m) + (m.is_householder ? ` (${t("householder")})` : ""))
            .join(", ")}
        </p>
      )}

      <div className="mt-6">
        <AdminEditForm
          initial={a}
          heads={heads}
          isAttendeeAdmin={isAttendeeAdmin}
          currentEmail={currentEmail}
        />
      </div>
    </div>
  );
}
