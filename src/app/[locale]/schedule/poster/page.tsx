import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { SchedulePoster, type PosterTheme } from "@/components/SchedulePoster";
import { PrintScheduleButton } from "@/components/PrintScheduleButton";
import { Link } from "@/i18n/navigation";
import type { ScheduleItem } from "@/lib/types";

// 수련회 장소 벽에 붙일 대형 이중언어(한국어+영어) 일정표. 18×24in 세로.
// 브라우저 인쇄 → "PDF로 저장" 으로 인쇄소에 넘길 파일을 만든다.
//
// 두 테마를 ?theme= 로 고른다:
//   light(기본) — 흰 바탕. 색 면을 쓰지 않아 '배경 그래픽' 설정과 무관하게 그대로 나온다.
//   dark        — 사이트 테마(파인그린 바탕). 인쇄 시 '배경 그래픽' 체크가 반드시 필요하다.
//
// 포스터는 두 언어를 한 장에 담으므로 로케일에 따라 내용이 바뀌지 않는다 —
// 로케일은 페이지 껍데기(안내문·버튼 라벨)에만 영향을 준다.

export const metadata: Metadata = {
  title: "복된 만남 수련회 일정 · Blessed Encounter Retreat Schedule",
  robots: { index: false, follow: false },
};

export default async function SchedulePosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ theme?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { theme: raw } = await searchParams;
  const theme: PosterTheme = raw === "dark" ? "dark" : "light";

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
  const isDark = theme === "dark";

  return (
    <main className="flex-1 bg-mist py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-6 flex max-w-[18in] flex-wrap items-start justify-between gap-4 px-6 print:hidden">
        <div className="max-w-2xl text-sm leading-relaxed text-bark-soft">
          <p>
            <strong>18 × 24 인치 세로</strong> 기준입니다. 인쇄 대화상자에서{" "}
            <strong>PDF로 저장</strong>을 고르면 인쇄소에 넘길 파일이 됩니다.
          </p>
          <p className="mt-1">
            {isDark ? (
              <>
                ⚠️ 어두운 배경 버전은 인쇄 설정에서 <strong>‘배경 그래픽’을 반드시 체크</strong>
                해야 합니다. 체크하지 않으면 배경이 빠져 글자가 보이지 않습니다.
              </>
            ) : (
              <>
                밝은 버전은 색 면을 쓰지 않아 <strong>‘배경 그래픽’ 체크 없이도</strong> 그대로
                출력됩니다.
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/schedule/poster"
            className={`rounded-md px-3 py-1.5 text-sm font-medium ring-1 ${
              isDark
                ? "text-bark-soft ring-line hover:bg-white/70"
                : "bg-pine text-ivory ring-pine"
            }`}
          >
            밝은 배경
          </Link>
          <Link
            href="/schedule/poster?theme=dark"
            className={`rounded-md px-3 py-1.5 text-sm font-medium ring-1 ${
              isDark
                ? "bg-pine text-ivory ring-pine"
                : "text-bark-soft ring-line hover:bg-white/70"
            }`}
          >
            어두운 배경
          </Link>
          <PrintScheduleButton />
        </div>
      </div>
      <SchedulePoster items={items} theme={theme} />
    </main>
  );
}
