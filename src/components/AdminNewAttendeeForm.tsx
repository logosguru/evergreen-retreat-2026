"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { PersonFields, emptyPerson } from "./PersonFields";
import {
  adminInsertAttendee,
  type AdminInsertPayload,
} from "@/app/[locale]/admin/actions";
import { LANGUAGES, type Language, type Attendee } from "@/lib/types";
import type { PersonInput } from "@/lib/attendee-rows";
import { displayName } from "@/lib/names";

type HeadOption = Pick<Attendee, "id" | "korean_name" | "english_name">;

const labelClass = "block text-sm font-medium text-slate-700";
const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

export function AdminNewAttendeeForm({ heads }: { heads: HeadOption[] }) {
  // 공유 라벨은 Register 네임스페이스(등록 방식·가족 구성원 등), admin 필드는 Admin 네임스페이스 재사용.
  const tReg = useTranslations("Register");
  const tAdmin = useTranslations("Admin");
  const tc = useTranslations("Common");
  const tf = useTranslations("Fields");
  const tl = useTranslations("Language");
  const router = useRouter();

  const [mode, setMode] = useState<"individual" | "household">("individual");
  const [email, setEmail] = useState("");
  const [householder, setHouseholder] = useState<PersonInput>(emptyPerson());
  const [members, setMembers] = useState<PersonInput[]>([]);
  const [language, setLanguage] = useState<Language>("ko");
  const [retreatGroup, setRetreatGroup] = useState("");
  const [isGroupLeader, setIsGroupLeader] = useState(false);
  // "" = 새 가구(독립). 개인 모드에서만 사용 — 기존 가구주에 붙이기.
  const [attachToHeadId, setAttachToHeadId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function patchHouseholder(patch: Partial<PersonInput>) {
    setHouseholder((prev) => ({ ...prev, ...patch }));
  }

  function patchMember(index: number, patch: Partial<PersonInput>) {
    setMembers((prev) =>
      prev.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    );
  }

  function addMember() {
    setMembers((prev) => [...prev, emptyPerson()]);
  }

  function removeMember(index: number) {
    setMembers((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload: AdminInsertPayload = {
      mode,
      email,
      householder,
      members: mode === "household" ? members : [],
      language,
      retreat_group: retreatGroup,
      is_group_leader: isGroupLeader,
      attachToHeadId: mode === "individual" ? attachToHeadId : "",
    };
    start(async () => {
      const res = await adminInsertAttendee(payload);
      if (res.ok) {
        // push 만 사용(동적 라우트라 최신 데이터로 재렌더). push+refresh 를 함께 쓰면
        // 두 내비게이션이 경합해 transition pending 이 풀리지 않는 함정이 있음.
        router.push("/admin/attendees");
      } else {
        setError(res.error);
      }
    });
  }

  // admin 네임스페이스 오류(notAdmin/headNotFound)는 tAdmin, 그 외 검증 오류는 tReg 재사용.
  const errText = error
    ? error === "notAdmin" || error === "headNotFound"
      ? tAdmin(error)
      : tReg(error)
    : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* 등록 방식 선택 */}
      <fieldset>
        <legend className={labelClass}>{tReg("mode")}</legend>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="mode"
              checked={mode === "individual"}
              onChange={() => setMode("individual")}
            />
            {tReg("modeIndividual")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="mode"
              checked={mode === "household"}
              onChange={() => setMode("household")}
            />
            {tReg("modeHousehold")}
          </label>
        </div>
      </fieldset>

      {/* 가구 지정 (개인 모드) — 기존 가구에 구성원으로 추가 */}
      {mode === "individual" && (
        <fieldset className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <legend className="px-1 text-sm font-semibold text-slate-700">
            {tAdmin("householdLabel")}
          </legend>
          <label className={labelClass}>{tAdmin("headSelect")}</label>
          <select
            value={attachToHeadId}
            onChange={(e) => setAttachToHeadId(e.target.value)}
            className={inputClass}
          >
            <option value="">{tAdmin("headNewIndependent")}</option>
            {heads.map((h) => (
              <option key={h.id} value={h.id}>
                {displayName(h)}
              </option>
            ))}
          </select>
        </fieldset>
      )}

      {/* 이메일 (선택) */}
      <div>
        <label className={labelClass}>{tf("email")}</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
          placeholder="you@example.com"
        />
        <p className="mt-1 text-xs text-slate-500">{tAdmin("newEmailHint")}</p>
      </div>

      {/* 가구주 / 개인 */}
      <section className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="mb-4 text-base font-semibold text-slate-900">
          {mode === "household"
            ? tReg("householderSection")
            : tReg("modeIndividual")}
        </h2>
        <PersonFields
          value={householder}
          onChange={patchHouseholder}
          groupId="householder"
          showContact
        />
      </section>

      {/* 가족 구성원 (household 모드) */}
      {mode === "household" && (
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-slate-900">
            {tReg("familySection")}
          </h2>
          {members.map((m, i) => (
            <div
              key={i}
              className="rounded-xl bg-white p-5 ring-1 ring-slate-200"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500">
                  #{i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeMember(i)}
                  className="text-sm font-medium text-rose-600 hover:text-rose-700"
                >
                  {tReg("removeMember")}
                </button>
              </div>
              <PersonFields
                value={m}
                onChange={(patch) => patchMember(i, patch)}
                groupId={`member-${i}`}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={addMember}
            className="rounded-lg border border-dashed border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            + {tReg("addMember")}
          </button>
        </section>
      )}

      {/* 관리자 항목 */}
      <fieldset className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
        <legend className="px-1 text-sm font-semibold text-slate-700">
          {tAdmin("adminFields")}
        </legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>{tAdmin("colLanguage")}</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
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
            <label className={labelClass}>{tAdmin("colGroup")}</label>
            <input
              type="text"
              value={retreatGroup}
              onChange={(e) => setRetreatGroup(e.target.value)}
              className={inputClass}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isGroupLeader}
              onChange={(e) => setIsGroupLeader(e.target.checked)}
            />
            {tAdmin("groupLeader")}
          </label>
        </div>
      </fieldset>

      {errText && (
        <p className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {errText}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? tc("submitting") : tc("save")}
      </button>
    </form>
  );
}
