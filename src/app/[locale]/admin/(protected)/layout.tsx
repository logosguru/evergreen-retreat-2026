import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
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

  return <>{children}</>;
}
