"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { setAttendeeAdmin } from "@/app/[locale]/admin/actions";

export type AdminRow = {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
};

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";
const labelClass = "block text-sm font-medium text-slate-700";

export function AdminsManager({
  admins,
  currentEmail,
}: {
  admins: AdminRow[];
  currentEmail: string | null;
}) {
  const t = useTranslations("Admin");
  const tc = useTranslations("Common");
  const tf = useTranslations("Fields");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const me = (currentEmail ?? "").toLowerCase();

  function errText(code: string): string {
    switch (code) {
      case "cannotRemoveSelf":
        return t("cannotRemoveSelf");
      case "adminNeedsEmail":
        return t("adminNeedsEmail");
      case "notAdmin":
        return t("notAdmin");
      default:
        return t("adminRoleError");
    }
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await setAttendeeAdmin(email, true, name);
      if (r.ok) {
        setEmail("");
        setName("");
        router.refresh();
      } else {
        setError(errText(r.error));
      }
    });
  }

  function remove(a: AdminRow) {
    setError(null);
    start(async () => {
      const r = await setAttendeeAdmin(a.email, false, "");
      if (r.ok) {
        setConfirmingId(null);
        router.refresh();
      } else {
        setError(errText(r.error));
        setConfirmingId(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* 추가 폼 — 참석자가 아닌 관리자(교역자·준비위원)도 이메일로 직접 추가 */}
      <form
        onSubmit={add}
        className="rounded-xl bg-white p-5 ring-1 ring-slate-200"
      >
        <h2 className="text-base font-semibold text-slate-900">
          {t("addAdmin")}
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>
              {tf("email")} <span className="text-rose-500">*</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className={labelClass}>{t("colName")}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">{t("adminRoleHint")}</p>
        <button
          type="submit"
          disabled={pending}
          className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? tc("submitting") : t("addAdmin")}
        </button>
      </form>

      {error && (
        <p className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      {/* 목록 */}
      {admins.length === 0 ? (
        <p className="text-sm text-slate-500">{t("adminsEmpty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">{t("colName")}</th>
                <th className="px-4 py-3">{tf("email")}</th>
                <th className="px-4 py-3">{t("colAddedAt")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {admins.map((a) => {
                const isSelf = a.email.toLowerCase() === me;
                return (
                  <tr key={a.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {a.name ?? "—"}
                      {isSelf && (
                        <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                          {t("adminSelfBadge")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{a.email}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {a.created_at.slice(0, 10)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isSelf ? (
                        <span className="text-xs text-slate-400">
                          {t("adminSelfNote")}
                        </span>
                      ) : confirmingId === a.id ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="text-xs text-rose-700">
                            {t("adminDeleteConfirm")}
                          </span>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => remove(a)}
                            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                          >
                            {t("deleteBtn")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingId(null)}
                            className="rounded-lg px-3 py-1.5 text-xs text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
                          >
                            {tc("cancel")}
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmingId(a.id)}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-300 hover:bg-rose-50"
                        >
                          {t("deleteBtn")}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
