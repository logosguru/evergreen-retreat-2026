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
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
      <p className="mt-2 text-sm text-slate-600">{t("enterEmail")}</p>
      <div className="mt-6">
        <EditRequestForm />
      </div>
    </div>
  );
}
