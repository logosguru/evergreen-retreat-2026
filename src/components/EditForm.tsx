"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { PersonFields } from "./PersonFields";
import { updateMyAttendee } from "@/app/[locale]/edit/actions";
import type { PersonInput } from "@/app/[locale]/register/actions";
import type { Attendee } from "@/lib/types";
import { displayName } from "@/lib/names";

function toPersonInput(a: Attendee): PersonInput {
  return {
    korean_name: a.korean_name ?? "",
    english_name: a.english_name ?? "",
    district: a.district ?? "",
    gender: a.gender ?? "",
    role: a.role ?? "",
    phone: a.phone ?? "",
    is_under_6: a.is_under_6,
    attendance: a.attendance,
    // wall-clock 보존: ISO 앞 16자("YYYY-MM-DDTHH:mm")만 사용
    arrival_at: a.arrival_at ? a.arrival_at.slice(0, 16) : "",
    departure_at: a.departure_at ? a.departure_at.slice(0, 16) : "",
    note: a.note ?? "",
  };
}

export function EditForm({ initial }: { initial: Attendee[] }) {
  const t = useTranslations("Edit");
  const tc = useTranslations("Common");
  const ta = useTranslations("Admin");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  const [rows, setRows] = useState(() =>
    initial.map((a) => ({
      id: a.id,
      isHead: a.is_householder,
      data: toPersonInput(a),
    })),
  );

  function patch(id: string, p: Partial<PersonInput>) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, data: { ...r.data, ...p } } : r)),
    );
    setSavedId(null);
  }

  function save(id: string, data: PersonInput) {
    setSavingId(id);
    setSavedId(null);
    setErrorId(null);
    start(async () => {
      const result = await updateMyAttendee(id, data);
      setSavingId(null);
      if (result.ok) {
        setSavedId(id);
        router.refresh();
      } else {
        setErrorId(id);
      }
    });
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
        {t("notFound")}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {rows.map((r) => (
        <section key={r.id} className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
          <div className="mb-3 flex items-center gap-2">
            <span className="font-semibold text-slate-900">
              {displayName(r.data)}
            </span>
            {r.isHead && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                {ta("householder")}
              </span>
            )}
          </div>
          <PersonFields
            value={r.data}
            onChange={(p) => patch(r.id, p)}
            groupId={`edit-${r.id}`}
            showContact
          />
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              disabled={pending && savingId === r.id}
              onClick={() => save(r.id, r.data)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {savingId === r.id ? tc("submitting") : tc("save")}
            </button>
            {savedId === r.id && (
              <span className="text-sm text-emerald-700">
                {t("updateSuccess")}
              </span>
            )}
            {errorId === r.id && (
              <span className="text-sm text-rose-700">{t("updateError")}</span>
            )}
          </div>
        </section>
      ))}

      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          {t("signOut")}
        </button>
      </form>
    </div>
  );
}
