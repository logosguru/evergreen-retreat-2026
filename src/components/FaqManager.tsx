"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { Faq } from "@/lib/types";
import { upsertFaq, deleteFaq } from "@/app/[locale]/admin/faq-actions";

const input =
  "rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

// 언어 라벨은 원어 고정 표기 (번역 안 함)
const LANGS = [
  { suffix: "", label: "한국어" },
  { suffix: "_en", label: "English" },
  { suffix: "_es", label: "Español" },
] as const;

type Suffix = (typeof LANGS)[number]["suffix"];
type TextKey = `${"question" | "answer"}${Suffix}`;
type TextFields = Record<TextKey, string>;

const EMPTY: TextFields = {
  question: "",
  question_en: "",
  question_es: "",
  answer: "",
  answer_en: "",
  answer_es: "",
};

export function FaqManager({ items }: { items: Faq[] }) {
  const t = useTranslations("Faq");
  const router = useRouter();
  const [, start] = useTransition();

  const [editId, setEditId] = useState<string | null>(null);
  const [fields, setFields] = useState<TextFields>(EMPTY);
  const [sortOrder, setSortOrder] = useState(0);
  const formRef = useRef<HTMLElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const set =
    (k: TextKey) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setFields((f) => ({ ...f, [k]: e.target.value }));

  function reset() {
    setEditId(null);
    setFields(EMPTY);
    setSortOrder(0);
  }

  function submit() {
    if (!fields.question.trim() || !fields.answer.trim()) return;
    start(async () => {
      await upsertFaq({
        id: editId ?? undefined,
        ...fields,
        sort_order: sortOrder,
      });
      reset();
      router.refresh();
    });
  }

  function editItem(f: Faq) {
    setEditId(f.id);
    setFields({
      question: f.question,
      question_en: f.question_en ?? "",
      question_es: f.question_es ?? "",
      answer: f.answer,
      answer_en: f.answer_en ?? "",
      answer_es: f.answer_es ?? "",
    });
    setSortOrder(f.sort_order);
    // 리스트가 길 때 폼이 화면 밖에 있으면 로드 여부를 알기 어려우므로
    // 폼으로 스크롤 + 첫 입력란 포커스 (스크롤은 smooth가 처리하도록 focus는 preventScroll).
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      firstFieldRef.current?.focus({ preventScroll: true });
    });
  }

  return (
    <div className="space-y-8">
      <ul className="space-y-3">
        {items.length === 0 && (
          <li className="text-sm text-slate-500">{t("empty")}</li>
        )}
        {items.map((f) => (
          <li key={f.id} className="rounded-lg p-3 text-sm ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-3">
              <span className="font-semibold text-slate-900">{f.question}</span>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => editItem(f)}
                  className="text-emerald-700 hover:text-emerald-800"
                >
                  {t("edit")}
                </button>
                <button
                  onClick={() =>
                    start(async () => {
                      await deleteFaq(f.id);
                      router.refresh();
                    })
                  }
                  className="text-rose-600 hover:text-rose-700"
                >
                  {t("delete")}
                </button>
              </div>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-slate-600">{f.answer}</p>
          </li>
        ))}
      </ul>

      <section ref={formRef} className="scroll-mt-4 rounded-lg p-4 ring-1 ring-slate-200">
        <h2 className="mb-3 text-base font-semibold text-slate-900">
          {editId ? t("editItem") : t("addItem")}
        </h2>
        <div className="space-y-4">
          {LANGS.map(({ suffix, label }) => (
            <div key={label} className="space-y-2">
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <input
                ref={suffix === "" ? firstFieldRef : undefined}
                className={`${input} w-full`}
                placeholder={t("questionField")}
                value={fields[`question${suffix}`]}
                onChange={set(`question${suffix}`)}
              />
              <textarea
                className={`${input} w-full`}
                rows={suffix === "" ? 4 : 3}
                placeholder={t("answerField")}
                value={fields[`answer${suffix}`]}
                onChange={set(`answer${suffix}`)}
              />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              {t("sortOrder")}
              <input
                type="number"
                className={`${input} w-20`}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
              />
            </label>
            <button
              onClick={submit}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              {editId ? t("save") : t("add")}
            </button>
            {editId && (
              <button
                onClick={reset}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                {t("cancel")}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
