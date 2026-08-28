import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { SchedulePoster } from "@/components/SchedulePoster";
import { PrintScheduleButton } from "@/components/PrintScheduleButton";
import type { ScheduleItem } from "@/lib/types";

// 수련회 장소 벽에 붙일 대형 이중언어(한국어+영어) 일정표.
// 브라우저 인쇄 → "PDF로 저장" 으로 인쇄소에 넘길 파일을 만든다. 용지는 Tabloid 가로
// 17×11in 기준(@page)이며, 인쇄 대화상자에서 A3·Letter 로 바꿔도 3열 표가 비율에 맞게 나온다.
// 포스터 자체는 두 언어를 한 장에 담으므로 로케일에 따라 내용이 바뀌지 않는다 —
// 로케일은 페이지 껍데기(인쇄 버튼 라벨)에만 영향을 준다.

export const metadata: Metadata = {
  title: "복된 만남 수련회 일정 · Blessed Encounter Retreat Schedule",
  robots: { index: false, follow: false },
};

export default async function SchedulePosterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  // 포스터는 공개 게시물 — owner/admin_note(관리자 전용) 는 선택하지 않는다.
  const { data } = await supabase
    .from("schedule_items")
    .select(
      "id, day, start_time, title, title_en, title_es, description, description_en, description_es, location, location_en, location_es, sort_order, by_language, created_at",
    )
    .order("day")
    .order("start_time")
    .order("sort_order");

  const items = (data as ScheduleItem[] | null) ?? [];

  return (
    <main className="flex-1 bg-mist py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-6 flex max-w-[17in] items-center justify-between gap-4 px-6 print:hidden">
        <p className="text-sm leading-relaxed text-bark-soft">
          Tabloid 가로(17×11in) 기준입니다. 인쇄 대화상자에서 <strong>PDF로 저장</strong>을
          고르면 인쇄소에 넘길 파일이 됩니다. 색 면을 쓰지 않아
          <strong> &lsquo;배경 그래픽&rsquo; 체크 없이도</strong> 그대로 출력됩니다.
        </p>
        <PrintScheduleButton />
      </div>
      <SchedulePoster items={items} />
    </main>
  );
}
