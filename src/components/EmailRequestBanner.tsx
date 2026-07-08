"use client";

import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { setEmailRequestProcessed } from "@/app/[locale]/admin/actions";

export type EmailRequest = {
  id: string;
  name_entered: string;
  email: string;
  phone: string | null;
  created_at: string;
};

export function EmailRequestBanner({ requests }: { requests: EmailRequest[] }) {
  const t = useTranslations("Admin");
  const router = useRouter();
  const [pending, start] = useTransition();

  if (requests.length === 0) return null;

  function markProcessed(id: string) {
    start(async () => {
      await setEmailRequestProcessed(id);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl bg-amber-50 p-5 ring-1 ring-amber-200">
      <p className="text-base font-semibold text-amber-900">
        {t("requestsTitle")} ({requests.length})
      </p>
      <p className="mt-1 text-sm text-amber-800">{t("requestsHint")}</p>
      <ul className="mt-3 space-y-2">
        {requests.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-amber-100"
          >
            <span className="font-semibold text-slate-900">
              {r.name_entered}
            </span>
            <span className="font-mono text-slate-700">{r.email}</span>
            {r.phone && <span className="text-slate-500">{r.phone}</span>}
            <span className="text-xs text-slate-400">
              {r.created_at.slice(0, 10)}
            </span>
            <button
              type="button"
              onClick={() => markProcessed(r.id)}
              disabled={pending}
              className="ml-auto rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {t("requestProcessed")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
