import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { RegistrationForm } from "@/components/RegistrationForm";
import { REGISTRATION_OPEN, type RoomType } from "@/lib/types";
import { Link } from "@/i18n/navigation";

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // 마감 상태에선 등록 폼을 그리지 않으므로 객실 타입 조회도 생략한다.
  let roomTypes: RoomType[] = [];
  if (REGISTRATION_OPEN) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("room_types")
      .select("*")
      .order("sort_order");
    roomTypes = (data as RoomType[] | null) ?? [];
  }

  const t = await getTranslations("Register");

  return (
    <div className="mx-auto max-w-2xl px-6 py-16 sm:px-8">
      <h1 className="font-display-ko text-3xl font-bold text-pine sm:text-4xl">
        {REGISTRATION_OPEN ? t("title") : t("closedTitle")}
      </h1>
      <div className="mt-4 h-px w-14 bg-gold" />
      {REGISTRATION_OPEN ? (
        <p className="mt-4 text-sm leading-relaxed text-bark-soft">
          {t("subtitle")}
        </p>
      ) : (
        <div className="mt-6 rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-200">
          <p className="text-sm leading-relaxed text-amber-900">
            {t("closedBody")}
          </p>
          <Link
            href="/edit"
            className="mt-4 inline-flex items-center justify-center rounded-full bg-pine px-5 py-2.5 text-sm font-semibold text-ivory transition hover:bg-pine-deep"
          >
            {t("goToEdit")}
          </Link>
        </div>
      )}
      <div className="mt-8">
        <RegistrationForm roomTypes={roomTypes} />
      </div>
    </div>
  );
}
