"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { Announcement } from "@/lib/types";
import {
  upsertAnnouncement,
  deleteAnnouncement,
  toggleAnnouncementFlag,
} from "@/app/[locale]/admin/announcement-actions";

const input =
  "rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

export function AnnouncementManager({ items }: { items: Announcement[] }) {
  const t = useTranslations("Announcements");
  const router = useRouter();
  const [, start] = useTransition();

  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [published, setPublished] = useState(true);

  function reset() {
    setEditId(null);
    setTitle("");
    setBody("");
    setPinned(false);
    setPublished(true);
  }

  function submit() {
    if (!title.trim() || !body.trim()) return;
    start(async () => {
      await upsertAnnouncement({
        id: editId ?? undefined,
        title,
        body,
        pinned,
        published,
      });
      reset();
      router.refresh();
    });
  }

  function editItem(a: Announcement) {
    setEditId(a.id);
    setTitle(a.title);
    setBody(a.body);
    setPinned(a.pinned);
    setPublished(a.published);
  }

  return (
    <div className="space-y-8">
      <ul className="space-y-3">
        {items.length === 0 && (
          <li className="text-sm text-slate-500">{t("empty")}</li>
        )}
        {items.map((a) => (
          <li key={a.id} className="rounded-lg p-3 text-sm ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="font-semibold text-slate-900">{a.title}</span>
                {a.pinned && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                    {t("pinned")}
                  </span>
                )}
                {!a.published && (
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                    {t("hidden")}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() =>
                    start(async () => {
                      await toggleAnnouncementFlag(a.id, "pinned", !a.pinned);
                      router.refresh();
                    })
                  }
                  className="text-slate-600 hover:text-slate-900"
                >
                  {a.pinned ? t("unpin") : t("pin")}
                </button>
                <button
                  onClick={() =>
                    start(async () => {
                      await toggleAnnouncementFlag(
                        a.id,
                        "published",
                        !a.published,
                      );
                      router.refresh();
                    })
                  }
                  className="text-slate-600 hover:text-slate-900"
                >
                  {a.published ? t("hide") : t("publish")}
                </button>
                <button
                  onClick={() => editItem(a)}
                  className="text-emerald-700 hover:text-emerald-800"
                >
                  {t("edit")}
                </button>
                <button
                  onClick={() =>
                    start(async () => {
                      await deleteAnnouncement(a.id);
                      router.refresh();
                    })
                  }
                  className="text-rose-600 hover:text-rose-700"
                >
                  {t("delete")}
                </button>
              </div>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-slate-600">{a.body}</p>
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
            placeholder={t("titleField")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className={`${input} w-full`}
            rows={4}
            placeholder={t("bodyField")}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={pinned}
                onChange={(e) => setPinned(e.target.checked)}
              />{" "}
              {t("pinned")}
            </label>
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={published}
                onChange={(e) => setPublished(e.target.checked)}
              />{" "}
              {t("publishedLabel")}
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
