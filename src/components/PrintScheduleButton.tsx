"use client";

import { useTranslations } from "next-intl";

// 브라우저 인쇄 다이얼로그 호출 → 사용자가 "PDF로 저장" 선택.
// 인쇄 시 화면 UI는 print:hidden, SchedulePrintable(hidden print:block)만 출력됨.
export function PrintScheduleButton() {
  const t = useTranslations("Schedule");
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900"
    >
      {t("printPdf")}
    </button>
  );
}
