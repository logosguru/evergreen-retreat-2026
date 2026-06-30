"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { TurnstileWidget } from "./TurnstileWidget";
import { requestEditMagicLink } from "@/app/[locale]/edit/actions";

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

export function EditRequestForm() {
  const t = useTranslations("Edit");
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const needsCaptcha = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  function resetCaptcha() {
    setToken(null);
    setCaptchaKey((k) => k + 1);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await requestEditMagicLink({
        email,
        turnstileToken: token,
        origin: window.location.origin,
      });
      if (res.ok) setSent(true);
      else {
        setError(res.error);
        resetCaptcha();
      }
    });
  }

  if (sent) {
    return (
      <div className="rounded-xl bg-emerald-50 p-6 ring-1 ring-emerald-200">
        <p className="text-sm font-medium text-emerald-800">{t("linkSent")}</p>
        <p className="mt-2 text-xs text-emerald-700">{t("linkSentNote")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700">
          {t("emailLabel")}
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
          placeholder="you@example.com"
        />
      </div>
      <TurnstileWidget
        key={captchaKey}
        onVerify={setToken}
        onExpire={() => setToken(null)}
        locale={locale}
      />
      {error && (
        <p className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {t(error)}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || (needsCaptcha && !token)}
        className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? t("sending") : t("sendLink")}
      </button>
    </form>
  );
}
