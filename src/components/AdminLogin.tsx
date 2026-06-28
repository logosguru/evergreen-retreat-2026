"use client";

import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

export function AdminLogin() {
  const t = useTranslations("Admin");

  async function signIn() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/admin`,
      },
    });
  }

  return (
    <button
      type="button"
      onClick={signIn}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-base font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
    >
      {t("loginWithGoogle")}
    </button>
  );
}
