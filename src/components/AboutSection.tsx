import Image from "next/image";
import { useTranslations } from "next-intl";
import { Reveal } from "./Reveal";

const galleryImages = [
  { src: "/venue/misty-morning.webp", alt: "Misty morning at Honor's Haven" },
  { src: "/venue/heart-island.webp", alt: "Heart island lake" },
  { src: "/venue/fountain.webp", alt: "Honor's Haven fountain" },
];

export function AboutSection() {
  const t = useTranslations("About");

  return (
    <section id="about" className="scroll-mt-20 bg-cream">
      <div className="mx-auto max-w-6xl px-6 py-24 sm:px-8">
        <Reveal>
          <p className="eyebrow text-gold">{t("theme")}</p>
          <h2 className="font-display-ko mt-3 text-4xl font-bold text-pine sm:text-5xl">
            {t("title")}
          </h2>
          <div className="mt-5 h-px w-16 bg-gold" />
        </Reveal>

        <div className="mt-14 grid gap-10 md:grid-cols-5">
          {/* 장소 이미지 */}
          <Reveal className="md:col-span-3">
            <figure>
              <div className="relative aspect-[16/10] overflow-hidden rounded-2xl shadow-lg ring-1 ring-pine/10">
                <Image
                  src="/venue/autumn-hills.webp"
                  alt="Honor's Haven Retreat & Conference"
                  fill
                  sizes="(max-width: 768px) 100vw, 60vw"
                  className="object-cover"
                />
              </div>
              <figcaption className="mt-3">
                <a
                  href="https://www.honorshaven.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-moss transition hover:text-pine"
                >
                  {t("whereLink")} →
                </a>
              </figcaption>
            </figure>
          </Reveal>

          {/* 일정 / 장소 */}
          <Reveal delay={120} className="space-y-5 md:col-span-2">
            <InfoCard label={t("whenTitle")} body={t("when")} />
            <InfoCard label={t("whereTitle")} body={t("where")} />
          </Reveal>
        </div>

        {/* 회비 / 준비물 */}
        <Reveal delay={80} className="mt-8 grid gap-6 sm:grid-cols-2">
          <InfoCard label={t("feeTitle")} body={t("fee")} preLine />
          <InfoCard label={t("prepareTitle")} body={t("prepare")} preLine />
        </Reveal>

        {/* 장소 갤러리 */}
        <Reveal delay={60} className="mt-10 grid grid-cols-3 gap-3 sm:gap-4">
          {galleryImages.map((img) => (
            <div
              key={img.src}
              className="relative aspect-[4/3] overflow-hidden rounded-xl ring-1 ring-pine/10"
            >
              <Image
                src={img.src}
                alt={img.alt}
                fill
                sizes="(max-width: 640px) 33vw, 30vw"
                className="object-cover transition duration-500 hover:scale-105"
              />
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

function InfoCard({
  label,
  body,
  preLine = false,
}: {
  label: string;
  body: string;
  preLine?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-white/70 p-6 ring-1 ring-line">
      <h3 className="flex items-center gap-2 text-base font-semibold text-pine">
        <span className="text-gold">✦</span>
        {label}
      </h3>
      <p
        className={`mt-2 leading-relaxed text-bark-soft ${preLine ? "whitespace-pre-line" : ""}`}
      >
        {body}
      </p>
    </div>
  );
}
