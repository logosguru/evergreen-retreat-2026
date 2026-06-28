"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

export function EditRequestForm() {
  const t = useTranslations("Edit");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          // 등록만 하고 인증 유저가 아닐 수 있으므로 생성 허용
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/edit/manage`,
        },
      });
      if (error) setError(error.message);
      else setSent(true);
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
      {error && (
        <p className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? t("sending") : t("sendLink")}
      </button>
    </form>
  );
}
