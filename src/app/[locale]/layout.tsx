import type { Metadata } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { fraunces, myeongjo, pretendard } from "../fonts";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Common" });
  return {
    title: t("appName"),
    description: t("appName"),
  };
}

// 루트 레이아웃: <html> + 폰트 + i18n provider 만 담당.
// 사이트 헤더/푸터는 (site) 라우트 그룹 레이아웃으로 분리 — QR용 /schedule 전용 화면은
// 그 그룹 밖에 있어서 헤더/푸터 없이 렌더된다.
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      data-scroll-behavior="smooth"
      className={`h-full antialiased ${pretendard.variable} ${fraunces.variable} ${myeongjo.variable}`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
