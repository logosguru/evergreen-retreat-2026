import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Reveal } from "./Reveal";
import { TopoRings } from "./TopoField";

export function CtaBand() {
  const t = useTranslations("Home");

  return (
    <section className="relative isolate overflow-hidden bg-pine-deep">
      <div className="absolute inset-0 -z-10">
        <Image
          src="/venue/misty-morning.webp"
          alt=""
          fill
          sizes="100vw"
          className="object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-pine-deep via-pine-deep/85 to-pine-deep/70" />
      </div>
      <TopoRings className="pointer-events-none absolute -right-28 top-1/2 hidden h-[150%] w-auto -translate-y-1/2 text-gold/25 sm:block" />

      <div className="mx-auto max-w-3xl px-6 py-24 text-center sm:px-8">
        <Reveal>
          <p className="eyebrow text-gold-soft">Blessed Encounter</p>
          <p className="font-display mt-5 text-2xl italic leading-relaxed text-ivory sm:text-3xl">
            {t("intro")}
          </p>
          <div className="mt-10">
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-full bg-gold px-9 py-4 text-base font-semibold text-pine-deep shadow-lg shadow-black/30 transition hover:-translate-y-0.5 hover:bg-gold-soft"
            >
              {t("registerCta")}
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
