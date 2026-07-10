import Image from "next/image";
import { useTranslations } from "next-intl";
import { Reveal } from "./Reveal";
import { TopoRings } from "./TopoField";

// 강사별 사진은 정적 데이터(번역 불필요), 문구는 messages/Speakers.
const speakers = [
  { photo: "/speakers/jung-jungwon.jpg", nameKey: "s1Name", bioKey: "s1Bio" },
  { photo: "/speakers/park-sunhee.jpg", nameKey: "s2Name", bioKey: "s2Bio" },
] as const;

export function SpeakersSection() {
  const t = useTranslations("Speakers");

  return (
    <section id="speakers" className="relative isolate scroll-mt-20 overflow-hidden bg-pine">
      <TopoRings className="pointer-events-none absolute -left-32 -top-24 h-[130%] w-auto text-gold/15" />
      <div className="relative mx-auto max-w-5xl px-6 py-24 sm:px-8">
        <Reveal>
          <p className="eyebrow text-gold-soft">Speakers</p>
          <h2 className="font-display-ko mt-3 text-4xl font-bold text-white sm:text-5xl">
            {t("title")}
          </h2>
          <div className="mt-5 h-px w-16 bg-gold" />
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {speakers.map((sp, i) => (
            <Reveal key={sp.photo} delay={i * 120}>
              <article className="h-full rounded-2xl bg-cream p-7 shadow-xl shadow-black/20 ring-1 ring-black/5">
                <Image
                  src={sp.photo}
                  alt={t(sp.nameKey)}
                  width={220}
                  height={220}
                  className="mx-auto h-28 w-28 rounded-full object-cover ring-4 ring-gold/30"
                />
                <p className="font-display-ko mt-5 text-center text-xl font-bold text-pine">
                  {t(sp.nameKey)}
                </p>
                <p className="text-center text-sm text-moss">{t("church")}</p>
                <ul className="mt-5 space-y-1.5 text-sm leading-6 text-bark-soft">
                  {t(sp.bioKey)
                    .split("\n")
                    .map((line, idx) => (
                      <li key={idx} className="flex gap-2">
                        <span aria-hidden className="select-none text-moss">
                          •
                        </span>
                        <span>{line.replace(/^•\s*/, "")}</span>
                      </li>
                    ))}
                </ul>
              </article>
            </Reveal>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-ivory/45">{t("bioNote")}</p>
      </div>
    </section>
  );
}
