import { setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

// 일반 사이트 화면(홈·소개·강사·FAQ·등록·수정·관리자)의 공통 껍데기.
// QR용 /schedule 전용 화면은 이 그룹 밖에 있어 헤더/푸터가 붙지 않는다.
export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}
