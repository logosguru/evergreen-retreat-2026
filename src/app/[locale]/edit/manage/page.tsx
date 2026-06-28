import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { EditForm } from "@/components/EditForm";
import type { Attendee } from "@/lib/types";

export default async function ManagePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  // 매직링크 세션이 없으면 이메일 입력 화면으로
  if (!data?.claims) {
    redirect({ href: "/edit", locale });
  }

  // RLS가 본인 이메일/가구 행만 반환. 가구주가 위로 오도록 정렬.
  const { data: attendees } = await supabase
    .from("attendees")
    .select("*")
    .order("is_householder", { ascending: false })
    .order("created_at", { ascending: true });

  const t = await getTranslations("Edit");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">
        {t("yourRegistration")}
      </h1>
      <div className="mt-8">
        <EditForm initial={(attendees as Attendee[] | null) ?? []} />
      </div>
    </div>
  );
}
