import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function SiteFooter() {
  const t = useTranslations("Footer");

  return (
    <footer className="mt-auto border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-slate-500 sm:flex-row">
        <p>{t("copyright")}</p>
        <Link href="/admin/login" className="hover:text-slate-700">
          {t("adminLogin")}
        </Link>
      </div>
    </footer>
  );
}
