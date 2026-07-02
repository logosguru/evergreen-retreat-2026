import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

// 관리자 가드: 로그인 + app_role=admin 클레임 확인.
// (admins 테이블에 추가된 직후라면 토큰 갱신/재로그인 전까지 클레임이 반영되지 않을 수 있음 — 재로그인하면 됨)
export default async function ProtectedAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims) {
    redirect({ href: "/admin/login", locale });
  }

  const appMetadata = (claims?.app_metadata ?? {}) as Record<string, unknown>;
  const isAdmin = appMetadata.app_role === "admin";

  if (!isAdmin) {
    const t = await getTranslations("Admin");
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-base font-medium text-rose-700">{t("notAdmin")}</p>
        <form action="/auth/signout" method="post" className="mt-4">
          <button
            type="submit"
            className="text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            {t("signOut")}
          </button>
        </form>
      </div>
    );
  }

  const tn = await getTranslations("Admin");
  return (
    <>
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl gap-4 px-4 py-2 text-sm">
          <Link href="/admin" className="text-slate-600 hover:text-slate-900">
            {tn("navDashboard")}
          </Link>
          <Link
            href="/admin/attendees"
            className="text-slate-600 hover:text-slate-900"
          >
            {tn("navAttendees")}
          </Link>
          <Link href="/admin/rooms" className="text-slate-600 hover:text-slate-900">
            {tn("navRooms")}
          </Link>
          <Link
            href="/admin/assignments"
            className="text-slate-600 hover:text-slate-900"
          >
            {tn("navAssignments")}
          </Link>
          <Link
            href="/admin/schedule"
            className="text-slate-600 hover:text-slate-900"
          >
            {tn("navSchedule")}
          </Link>
          <Link
            href="/admin/faq"
            className="text-slate-600 hover:text-slate-900"
          >
            {tn("navFaq")}
          </Link>
          <Link
            href="/admin/admins"
            className="text-slate-600 hover:text-slate-900"
          >
            {tn("navAdmins")}
          </Link>
        </div>
      </nav>
      {children}
    </>
  );
}
