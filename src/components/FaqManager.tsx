"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { Faq } from "@/lib/types";
import { upsertFaq, deleteFaq } from "@/app/[locale]/admin/faq-actions";

const input =
  "rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

export function FaqManager({ items }: { items: Faq[] }) {
  const t = useTranslations("Faq");
  const router = useRouter();
  const [, start] = useTransition();

  const [editId, setEditId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sortOrder, setSortOrder] = useState(0);

  function reset() {
    setEditId(null);
    setQuestion("");
    setAnswer("");
    setSortOrder(0);
  }

  function submit() {
    if (!question.trim() || !answer.trim()) return;
    start(async () => {
      await upsertFaq({
        id: editId ?? undefined,
        question,
        answer,
        sort_order: sortOrder,
      });
      reset();
      router.refresh();
    });
  }

  function editItem(f: Faq) {
    setEditId(f.id);
    setQuestion(f.question);
    setAnswer(f.answer);
    setSortOrder(f.sort_order);
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

      <section className="rounded-lg p-4 ring-1 ring-slate-200">
        <h2 className="mb-3 text-base font-semibold text-slate-900">
          {editId ? t("editItem") : t("addItem")}
        </h2>
        <div className="space-y-2">
          <input
            className={`${input} w-full`}
            placeholder={t("questionField")}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <textarea
            className={`${input} w-full`}
            rows={4}
            placeholder={t("answerField")}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
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
