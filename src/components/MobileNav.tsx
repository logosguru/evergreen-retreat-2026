"use client";

import { useEffect, useRef, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";

export function MobileNav({
  links,
  registerLabel,
  editLabel,
}: {
  links: readonly { href: string; label: string }[];
  registerLabel: string;
  editLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const mounted = useRef(false);

  // 라우트 변경 시 패널 닫기
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setOpen(false);
  }, [pathname]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-md text-emerald-50 hover:bg-white/10"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-52 rounded-lg bg-white py-2 shadow-lg ring-1 ring-slate-200">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/register"
            className="block px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-slate-50"
          >
            {registerLabel}
          </Link>
          <Link
            href="/edit"
            className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            {editLabel}
          </Link>
        </div>
      )}
    </div>
  );
}
