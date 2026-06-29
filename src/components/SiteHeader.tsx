import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./LocaleSwitcher";
import logo from "../../public/evergreen-logo.webp";

export function SiteHeader() {
  const t = useTranslations("Nav");

  return (
    <header className="bg-emerald-800">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center" aria-label="Evergreen Church">
          <Image
            src={logo}
            alt="Evergreen Church"
            priority
            className="h-8 w-auto"
          />
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/register" className="text-emerald-50/90 hover:text-white">
            {t("register")}
          </Link>
          <span aria-hidden className="h-4 w-px bg-white/25" />
          <Link href="/edit" className="text-emerald-50/90 hover:text-white">
            {t("edit")}
          </Link>
          <LocaleSwitcher />
        </nav>
      </div>
    </header>
  );
}
