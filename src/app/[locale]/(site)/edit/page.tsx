import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { EditRequestForm } from "@/components/EditRequestForm";

export default function EditPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = use(params);
  setRequestLocale(locale);

  const t = useTranslations("Edit");

  return (
    <div className="mx-auto max-w-md px-6 py-16 sm:px-8">
      <h1 className="font-display-ko text-3xl font-bold text-pine sm:text-4xl">
        {t("title")}
      </h1>
      <div className="mt-4 h-px w-14 bg-gold" />
      <p className="mt-4 text-sm leading-relaxed text-bark-soft">{t("enterEmail")}</p>
      <div className="mt-6">
        <EditRequestForm />
      </div>
    </div>
  );
}
