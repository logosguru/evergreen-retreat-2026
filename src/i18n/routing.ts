import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // 한국어 기본, 영어 선택
  locales: ["ko", "en"],
  defaultLocale: "ko",
  // 기본 로케일(ko)은 prefix 없는 깔끔한 URL(/register), 영어는 /en/register
  localePrefix: "as-needed",
});
