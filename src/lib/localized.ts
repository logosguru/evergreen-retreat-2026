// 다국어 콘텐츠 fallback 규칙 (단일 관리 지점):
// locale이 en/es면 해당 언어 컬럼(비어있지 않을 때) → 아니면 한국어 원본.
export function localized<
  F extends string,
  T extends Partial<Record<F | `${F}_en` | `${F}_es`, string | null>>,
>(item: T, field: F, locale: string): string | null {
  if (locale === "en" || locale === "es") {
    const v = item[`${field}_${locale}` as keyof T];
    if (typeof v === "string" && v.trim()) return v;
  }
  const base = item[field as keyof T];
  return typeof base === "string" && base.trim() ? base : null;
}
