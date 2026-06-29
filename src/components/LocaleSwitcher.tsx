"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";

// 한/영 토글: 현재 경로를 유지한 채 로케일만 전환
export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("Common");

  const other = locale === "ko" ? "en" : "ko";

  return (
    <button
      type="button"
      onClick={() => router.replace(pathname, { locale: other })}
      className="rounded-md border border-white/30 px-2.5 py-1 text-sm font-medium text-emerald-50 hover:bg-white/10"
    >
      {other === "ko" ? t("langKo") : t("langEn")}
    </button>
  );
}
