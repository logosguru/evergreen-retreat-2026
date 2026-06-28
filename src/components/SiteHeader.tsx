import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./LocaleSwitcher";

export function SiteHeader() {
  const t = useTranslations("Nav");
  const tc = useTranslations("Common");

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="font-semibold text-slate-900">
          {tc("appName")}
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/register" className="text-slate-600 hover:text-slate-900">
            {t("register")}
          </Link>
          <Link href="/edit" className="text-slate-600 hover:text-slate-900">
            {t("edit")}
          </Link>
          <LocaleSwitcher />
        </nav>
      </div>
    </header>
  );
}
