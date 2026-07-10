import { setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Hero } from "@/components/Hero";
import { AboutSection } from "@/components/AboutSection";
import { ScheduleSection } from "@/components/ScheduleSection";
import { SpeakersSection } from "@/components/SpeakersSection";
import { FaqSection } from "@/components/FaqSection";
import { CtaBand } from "@/components/CtaBand";
import type { ScheduleItem, Faq } from "@/lib/types";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const [scheduleRes, faqRes] = await Promise.all([
    // 공개엔 owner/admin_note(관리자 전용) 미노출 — 명시적 컬럼만 선택
    supabase
      .from("schedule_items")
      .select(
        "id, day, start_time, title, title_en, title_es, description, description_en, description_es, location, location_en, location_es, sort_order, by_language, created_at",
      )
      .order("day")
      .order("start_time")
      .order("sort_order"),
    supabase.from("faqs").select("*").order("sort_order").order("created_at"),
  ]);

  const scheduleItems = (scheduleRes.data as ScheduleItem[] | null) ?? [];
  const faqItems = (faqRes.data as Faq[] | null) ?? [];

  return (
    <>
      <Hero />
      <AboutSection />
      <ScheduleSection items={scheduleItems} />
      <SpeakersSection />
      <FaqSection items={faqItems} />
      <CtaBand />
    </>
  );
}
