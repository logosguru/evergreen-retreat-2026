import { useLocale, useTranslations } from "next-intl";
import type { Faq } from "@/lib/types";
import { localized } from "@/lib/localized";
import { Reveal } from "./Reveal";

// 답변 텍스트 안의 URL을 클릭 가능한 링크로 변환
const URL_RE = /(https?:\/\/[^\s]+)/g;

function linkify(text: string) {
  return text.split(URL_RE).map((part, i) =>
    part.startsWith("http://") || part.startsWith("https://") ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all font-medium text-moss underline hover:text-pine"
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
}

export function FaqSection({ items }: { items: Faq[] }) {
  const t = useTranslations("Faq");
  const locale = useLocale();

  return (
    <section id="faq" className="scroll-mt-20 bg-cream">
      <div className="mx-auto max-w-3xl px-6 py-24 sm:px-8">
        <Reveal>
          <p className="eyebrow text-gold">FAQ</p>
          <h2 className="font-display-ko mt-3 text-4xl font-bold text-pine sm:text-5xl">
            {t("pageTitle")}
          </h2>
          <div className="mt-5 h-px w-16 bg-gold" />
        </Reveal>

        {items.length === 0 ? (
          <Reveal>
            <p className="mt-10 rounded-2xl bg-white/60 px-6 py-10 text-center text-bark-soft ring-1 ring-line">
              {t("emptyPublic")}
            </p>
          </Reveal>
        ) : (
          <Reveal delay={80}>
            <dl className="mt-10 space-y-4">
              {items.map((f) => (
                <div
                  key={f.id}
                  className="rounded-2xl bg-white/70 p-6 ring-1 ring-line"
                >
                  <dt className="flex gap-3 text-lg font-semibold text-pine">
                    <span className="font-display text-gold">Q.</span>
                    {localized(f, "question", locale)}
                  </dt>
                  <dd className="mt-3 flex gap-3 whitespace-pre-wrap text-bark-soft">
                    <span className="font-display font-semibold text-moss">A.</span>
                    <span>{linkify(localized(f, "answer", locale) ?? "")}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        )}
      </div>
    </section>
  );
}
