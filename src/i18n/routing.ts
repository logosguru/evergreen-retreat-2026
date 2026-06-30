import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // 한국어 기본, 영어·스페인어 선택
  locales: ["ko", "en", "es"],
  defaultLocale: "ko",
  // 기본 로케일(ko)은 prefix 없는 깔끔한 URL(/register), 영어는 /en/register, 스페인어는 /es/register
  localePrefix: "as-needed",
});
