import { setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Hero } from "@/components/Hero";
import { AboutSection } from "@/components/AboutSection";
import { ScheduleSection } from "@/components/ScheduleSection";
import { SpeakersSection } from "@/components/SpeakersSection";
import { FaqSection } from "@/components/FaqSection";
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
    supabase
      .from("schedule_items")
      .select("*")
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
    </>
  );
}
