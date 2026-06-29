import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { MobileNav } from "./MobileNav";
import { RegisterMenu } from "./RegisterMenu";
import logo from "../../public/evergreen-logo.webp";

export function SiteHeader() {
  const t = useTranslations("Nav");

  const links = [
    { href: "/about", label: t("about") },
    { href: "/schedule", label: t("schedule") },
    { href: "/speakers", label: t("speakers") },
    { href: "/faq", label: t("faq") },
  ] as const;

  return (
    <header className="bg-emerald-800">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center" aria-label="Evergreen Church">
          <Image src={logo} alt="Evergreen Church" priority className="h-8 w-auto" />
        </Link>

        {/* 데스크톱 내비 */}
        <nav className="hidden items-center gap-4 text-sm sm:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-emerald-50/90 hover:text-white"
            >
              {l.label}
            </Link>
          ))}
          <RegisterMenu />
          <LocaleSwitcher />
        </nav>

        {/* 모바일 내비 (LocaleSwitcher는 바에 유지, 링크는 햄버거 패널) */}
        <div className="flex items-center gap-2 sm:hidden">
          <LocaleSwitcher />
          <MobileNav
            links={links}
            registerLabel={t("register")}
            editLabel={t("edit")}
          />
        </div>
      </div>
    </header>
  );
}
