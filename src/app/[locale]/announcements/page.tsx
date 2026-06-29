import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import type { Announcement } from "@/lib/types";

export default async function AnnouncementsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data } = await supabase
    .from("announcements")
    .select("*")
    .order("pinned", { ascending: false })
    .order("published_at", { ascending: false });

  const t = await getTranslations("Announcements");
  const items = (data as Announcement[] | null) ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-bold text-slate-900">{t("pageTitle")}</h1>
      {items.length === 0 ? (
        <p className="mt-6 text-slate-500">{t("emptyPublic")}</p>
      ) : (
        <ul className="mt-8 space-y-6">
          {items.map((a) => (
            <li
              key={a.id}
              className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
            >
              <div className="flex items-center gap-2">
                {a.pinned && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                    {t("pinned")}
                  </span>
                )}
                <h2 className="text-lg font-semibold text-slate-900">{a.title}</h2>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-slate-600">{a.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
