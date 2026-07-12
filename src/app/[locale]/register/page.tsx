import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { RegistrationForm } from "@/components/RegistrationForm";
import type { RoomType } from "@/lib/types";

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data: roomTypes } = await supabase
    .from("room_types")
    .select("*")
    .order("sort_order");

  const t = await getTranslations("Register");

  return (
    <div className="mx-auto max-w-2xl px-6 py-16 sm:px-8">
      <h1 className="font-display-ko text-3xl font-bold text-pine sm:text-4xl">
        {t("title")}
      </h1>
      <div className="mt-4 h-px w-14 bg-gold" />
      <p className="mt-4 text-sm leading-relaxed text-bark-soft">
        {t("subtitle")}
      </p>
      <div className="mt-8">
        <RegistrationForm roomTypes={(roomTypes as RoomType[] | null) ?? []} />
      </div>
    </div>
  );
}
