import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AdminEditForm } from "@/components/AdminEditForm";
import { displayName } from "@/lib/names";
import type {
  Attendee,
  FeePayment,
  HouseholdPaymentData,
  RoomType,
} from "@/lib/types";

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

  const { data: roomTypesData } = await supabase
    .from("room_types")
    .select("*")
    .order("sort_order");

  // 읽기전용 가구 맥락 + 가구 회비 납입(가구주 기준, 가구원 페이지에서도 동일 데이터)
  const headId = a.is_householder ? a.id : a.householder_id;
  let household: Pick<
    Attendee,
    "id" | "korean_name" | "english_name" | "is_householder" | "email"
  >[] = [];
  let payment: HouseholdPaymentData | null = null;
  if (headId) {
    const [{ data }, totalRes, payRes] = await Promise.all([
      supabase
        .from("attendees")
        .select("id, korean_name, english_name, is_householder, email")
        .or(`id.eq.${headId},householder_id.eq.${headId}`)
        .order("is_householder", { ascending: false }),
      supabase.rpc("household_total", { head_id: headId }),
      supabase
        .from("fee_payments")
        .select("*")
        .eq("head_id", headId)
        .order("paid_at", { ascending: true }),
    ]);
    household = data ?? [];
    // 조회 실패 시 $0/빈 내역으로 오인되지 않도록 섹션 자체를 숨긴다.
    if (!totalRes.error && !payRes.error) {
      payment = {
        headId,
        total: (totalRes.data as number | null) ?? 0,
        payments: (payRes.data as FeePayment[] | null) ?? [],
      };
    }
  }
  const headEmail = household.find((m) => m.is_householder)?.email ?? null;

  const t = await getTranslations("Admin");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">
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

      {headEmail && (
        <p className="mt-1 text-sm text-slate-500">
          {t("headEmail")}: <span className="text-slate-700">{headEmail}</span>
        </p>
      )}

      <div className="mt-6">
        <AdminEditForm
          initial={a}
          heads={heads}
          isAttendeeAdmin={isAttendeeAdmin}
          currentEmail={currentEmail}
          roomTypes={(roomTypesData as RoomType[] | null) ?? []}
          payment={payment}
        />
      </div>
    </div>
  );
}
