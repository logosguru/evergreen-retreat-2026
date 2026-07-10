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
    <div className="mx-auto max-w-2xl px-6 py-16 sm:px-8">
      <h1 className="font-display-ko text-3xl font-bold text-pine sm:text-4xl">
        {t("title")}
      </h1>
      <div className="mt-4 h-px w-14 bg-gold" />
      <p className="mt-4 text-sm leading-relaxed text-bark-soft">{t("subtitle")}</p>
      <div className="mt-8">
        <RegistrationForm />
      </div>
    </div>
  );
}
