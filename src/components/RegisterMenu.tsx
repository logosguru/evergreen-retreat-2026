"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

// 데스크톱 top nav 전용: "등록" 드롭다운 (등록하기 / 내 등록 수정)
export function RegisterMenu() {
  const t = useTranslations("Nav");
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const mounted = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  // 라우트 변경 시 닫기
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setOpen(false);
  }, [pathname]);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-md bg-white/15 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/25"
      >
        {t("register")}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-44 rounded-lg bg-white py-2 shadow-lg ring-1 ring-slate-200"
        >
          <Link
            href="/register"
            role="menuitem"
            className="block px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-slate-50"
          >
            {t("registerDo")}
          </Link>
          <Link
            href="/edit"
            role="menuitem"
            className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            {t("edit")}
          </Link>
        </div>
      )}
    </div>
  );
}
