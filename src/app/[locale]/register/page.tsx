import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { RegistrationForm } from "@/components/RegistrationForm";

export default function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = use(params);
  setRequestLocale(locale);

  const t = useTranslations("Register");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
      <p className="mt-2 text-sm text-slate-600">{t("subtitle")}</p>
      <div className="mt-8">
        <RegistrationForm />
      </div>
    </div>
  );
}
