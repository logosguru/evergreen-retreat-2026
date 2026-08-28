import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PublicSchedule } from "@/components/PublicSchedule";
import type { ScheduleItem } from "@/lib/types";

// 이름표 QR 전용 언어별 일정 페이지.
//   ko → /schedule · en → /en/schedule · es → /es/schedule
// (site) 라우트 그룹 밖이라 사이트 헤더/푸터 없이 렌더된다. 홈의 #schedule 섹션은 그대로.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Schedule" });
  return {
    title: t("qrMetaTitle"),
    description: t("pageTitle"),
  };
}

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  // 공개엔 owner/admin_note(관리자 전용) 미노출 — 명시적 컬럼만 선택 (홈 쿼리와 동일)
  const { data } = await supabase
    .from("schedule_items")
    .select(
      "id, day, start_time, title, title_en, title_es, description, description_en, description_es, location, location_en, location_es, sort_order, by_language, created_at",
    )
    .order("day")
    .order("start_time")
    .order("sort_order");

  return <PublicSchedule items={(data as ScheduleItem[] | null) ?? []} />;
}
