"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

// 한/영/스페인어 전환: 현재 경로를 유지한 채 로케일만 전환 (select)
export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("Common");

  const labels: Record<string, string> = {
    ko: t("langKo"),
    en: t("langEn"),
    es: t("langEs"),
  };

  return (
    <select
      aria-label={labels[locale]}
      value={locale}
      onChange={(e) => {
        const next = e.target.value as typeof locale;
        document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`;
        router.replace(pathname, { locale: next });
      }}
      className="rounded-md border border-white/30 bg-transparent px-2 py-1 text-sm font-medium text-emerald-50 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/40"
    >
      {routing.locales.map((loc) => (
        // option은 시스템 위젯이라 배경을 어둡게 지정(헤더 위 가독성)
        <option key={loc} value={loc} className="text-emerald-900">
          {labels[loc]}
        </option>
      ))}
    </select>
  );
}
