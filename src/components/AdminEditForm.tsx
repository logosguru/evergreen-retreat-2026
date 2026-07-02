"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { PersonFields } from "./PersonFields";
import {
  adminUpdateAttendee,
  adminDeleteAttendee,
  adminSetHouseholder,
  setAttendeeAdmin,
  type AdminEditInput,
} from "@/app/[locale]/admin/actions";
import { LANGUAGES, type Attendee } from "@/lib/types";
import { displayName } from "@/lib/names";

type HeadOption = Pick<Attendee, "id" | "korean_name" | "english_name">;

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";
const labelClass = "block text-sm font-medium text-slate-700";

function toInput(a: Attendee): AdminEditInput {
  return {
    korean_name: a.korean_name ?? "",
    english_name: a.english_name ?? "",
    district: a.district ?? "",
    gender: a.gender ?? "",
    role: a.role ?? "",
    phone: a.phone ?? "",
    email: a.email ?? "",
    is_under_6: a.is_under_6,
    attendance: a.attendance,
    arrival_at: a.arrival_at ? a.arrival_at.slice(0, 16) : "",
    departure_at: a.departure_at ? a.departure_at.slice(0, 16) : "",
    note: a.note ?? "",
    language: a.language,
    retreat_group: a.retreat_group ?? "",
    is_group_leader: a.is_group_leader,
  };
}

export function AdminEditForm({
  initial,
  heads,
  isAttendeeAdmin,
  currentEmail,
}: {
  initial: Attendee;
  heads: HeadOption[];
  isAttendeeAdmin: boolean;
  currentEmail: string | null;
}) {
  const t = useTranslations("Admin");
  const tc = useTranslations("Common");
  const tf = useTranslations("Fields");
  const tl = useTranslations("Language");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [data, setData] = useState<AdminEditInput>(() => toInput(initial));
  // "" = 독립(본인이 가구주). 아니면 소속 가구주 id.
  const initialHeadId = initial.is_householder ? "" : (initial.householder_id ?? "");
  const [headId, setHeadId] = useState<string>(initialHeadId);
  const [makeAdmin, setMakeAdmin] = useState(isAttendeeAdmin);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const hasEmail = !!(data.email ?? "").trim();
  // 본인(현재 로그인 관리자) 행이면 권한 토글 비활성 — 자기 잠금 방지.
  const isSelf =
    !!initial.email &&
    !!currentEmail &&
    initial.email.toLowerCase() === currentEmail.toLowerCase();

  function patch(p: Partial<AdminEditInput>) {
    setData((d) => ({ ...d, ...p }));
    setSaved(false);
  }

  function save() {
    setSaved(false);
    setError(null);
    start(async () => {
      const r = await adminUpdateAttendee(initial.id, data);
      if (!r.ok) {
        setError(t("saveError"));
        return;
      }
      // 가구주 선택이 바뀌었으면 재지정(구성원 승격 등은 RPC가 원자적으로 처리).
      if (headId !== initialHeadId) {
        const h = await adminSetHouseholder(initial.id, headId || null);
        if (!h.ok) {
          setError(t("householdError"));
          return;
        }
      }
      // 관리자 권한이 바뀌었으면 admins allowlist 반영(이메일은 위에서 이미 저장됨).
      if (makeAdmin !== isAttendeeAdmin) {
        const email = (data.email ?? "").trim();
        const name = data.korean_name || data.english_name || email;
        const ar = await setAttendeeAdmin(email, makeAdmin, name);
        if (!ar.ok) {
          setError(
            ar.error === "cannotRemoveSelf"
              ? t("cannotRemoveSelf")
              : ar.error === "adminNeedsEmail"
                ? t("adminNeedsEmail")
                : t("adminRoleError"),
          );
          return;
        }
      }
      setSaved(true);
      router.refresh();
    });
  }

  function del() {
    setError(null);
    start(async () => {
      const r = await adminDeleteAttendee(initial.id);
      if (r.ok) {
        router.push("/admin/attendees");
      } else {
        setError(t("deleteError"));
        setConfirming(false);
      }
    });
  }

  return (
    <div className="space-y-6">
      <fieldset className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
        <legend className="px-1 text-sm font-semibold text-slate-700">
          {t("householdLabel")}
        </legend>
        <label className={labelClass}>{t("headSelect")}</label>
        <select
          value={headId}
          onChange={(e) => {
            setHeadId(e.target.value);
            setSaved(false);
          }}
          className={inputClass}
        >
          <option value="">{t("headIndependent")}</option>
          {heads.map((h) => (
            <option key={h.id} value={h.id}>
              {displayName(h)}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">{t("headHint")}</p>
      </fieldset>

      <PersonFields value={data} onChange={patch} groupId={`admin-${initial.id}`} showContact />

      <div>
        <label className={labelClass}>{tf("email")}</label>
        <input
          type="email"
          value={data.email ?? ""}
          onChange={(e) => patch({ email: e.target.value })}
          className={inputClass}
        />
      </div>

      <fieldset className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
        <legend className="px-1 text-sm font-semibold text-slate-700">
          {t("adminFields")}
        </legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>{t("colLanguage")}</label>
            <select
              value={data.language}
              onChange={(e) => patch({ language: e.target.value as AdminEditInput["language"] })}
              className={inputClass}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {tl(l)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>{t("colGroup")}</label>
            <input
              type="text"
              value={data.retreat_group ?? ""}
              onChange={(e) => patch({ retreat_group: e.target.value })}
              className={inputClass}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={!!data.is_group_leader}
              onChange={(e) => patch({ is_group_leader: e.target.checked })}
            />
            {t("groupLeader")}
          </label>
        </div>

        <div className="mt-4 border-t border-slate-200 pt-4">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={makeAdmin}
              disabled={isSelf || !hasEmail}
              onChange={(e) => {
                setMakeAdmin(e.target.checked);
                setSaved(false);
              }}
            />
            {t("adminRole")}
          </label>
          <p className="mt-1 text-xs text-slate-500">
            {isSelf
              ? t("adminSelfNote")
              : !hasEmail
                ? t("adminNeedsEmail")
                : t("adminRoleHint")}
          </p>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? tc("submitting") : tc("save")}
        </button>
        {saved && <span className="text-sm text-emerald-700">{t("saved")}</span>}
        {error && <span className="text-sm text-rose-700">{error}</span>}

        <span className="flex-1" />

        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-300 hover:bg-rose-50"
          >
            {t("deleteBtn")}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-rose-700">{t("deleteConfirm")}</span>
            <button
              type="button"
              disabled={pending}
              onClick={del}
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              {t("deleteBtn")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
            >
              {tc("cancel")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
