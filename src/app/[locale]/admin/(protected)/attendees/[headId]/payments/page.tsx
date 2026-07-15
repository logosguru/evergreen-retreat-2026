import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { HouseholdPaymentManager } from "@/components/HouseholdPaymentManager";
import { displayName } from "@/lib/names";
import type { FeePayment } from "@/lib/types";

export default async function HouseholdPaymentsPage({
  params,
}: {
  params: Promise<{ locale: string; headId: string }>;
}) {
  const { locale, headId } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data: head } = await supabase
    .from("attendees")
    .select("id, korean_name, english_name, is_householder")
    .eq("id", headId)
    .single();
  if (!head || !head.is_householder) notFound();

  const [{ data: totalData }, { data: payData }] = await Promise.all([
    supabase.rpc("household_total", { head_id: headId }),
    supabase
      .from("fee_payments")
      .select("*")
      .eq("head_id", headId)
      .order("paid_at", { ascending: true }),
  ]);
  const total = (totalData as number | null) ?? 0;
  const payments = (payData as FeePayment[] | null) ?? [];

  const t = await getTranslations("Admin");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link
        href="/admin/attendees"
        className="text-sm font-medium text-emerald-700 hover:underline"
      >
        ← {t("title")}
      </Link>
      <h1 className="mt-3 text-2xl font-bold text-slate-900">
        {t("paymentsTitle")}
      </h1>
      <p className="mt-1 text-slate-600">{displayName(head)}</p>
      <div className="mt-6">
        <HouseholdPaymentManager
          headId={headId}
          total={total}
          payments={payments}
        />
      </div>
    </div>
  );
}
