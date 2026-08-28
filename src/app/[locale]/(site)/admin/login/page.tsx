import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { AdminLogin } from "@/components/AdminLogin";

export default function AdminLoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = use(params);
  setRequestLocale(locale);

  const t = useTranslations("Admin");

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-xl font-bold text-slate-900">{t("loginTitle")}</h1>
        <p className="mt-2 text-sm text-slate-600">{t("loginHint")}</p>
        <div className="mt-6">
          <AdminLogin />
        </div>
      </div>
    </div>
  );
}
