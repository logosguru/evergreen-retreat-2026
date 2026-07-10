import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { TopoRule } from "./TopoField";

export function SiteFooter() {
  const t = useTranslations("Footer");

  return (
    <footer className="mt-auto bg-pine text-ivory print:hidden">
      <TopoRule className="h-8 w-full text-gold/30" />
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-ivory/70 sm:flex-row sm:px-8">
        <p>{t("copyright")}</p>
        <Link href="/admin/login" className="transition hover:text-gold-soft">
          {t("adminLogin")}
        </Link>
      </div>
    </footer>
  );
}
