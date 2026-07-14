import { useLocale, useTranslations } from "next-intl";
import type { Faq } from "@/lib/types";
import { localized } from "@/lib/localized";
import { Reveal } from "./Reveal";

// FAQ 답변은 관리자만 작성(RLS)하므로 raw HTML을 그대로 렌더한다.
// 관리자가 <ul>/<li>/<strong>/<a> 등 태그를 직접 쓸 수 있다.
// 태그 밖의 맨 URL은 자동으로 <a>로 감싼다(기존 동작 유지, 태그 안 URL은 건드리지 않음).
const TAG_OR_URL = /(<[^>]+>)|(https?:\/\/[^\s<]+)/g;

function renderAnswerHtml(raw: string): string {
  return raw.replace(TAG_OR_URL, (_m, tag, url) =>
    tag
      ? tag
      : `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`,
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
                  <dd className="mt-3 flex gap-3 text-bark-soft">
                    <span className="font-display font-semibold text-moss">A.</span>
                    <span
                      className="min-w-0 flex-1 whitespace-pre-wrap [&_a]:break-all [&_a]:font-medium [&_a]:text-moss [&_a]:underline [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_strong]:font-semibold [&_strong]:text-pine [&_ul]:my-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5"
                      dangerouslySetInnerHTML={{
                        __html: renderAnswerHtml(
                          localized(f, "answer", locale) ?? "",
                        ),
                      }}
                    />
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
