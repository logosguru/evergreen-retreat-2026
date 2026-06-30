"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { TurnstileWidget } from "./TurnstileWidget";
import { PersonFields, emptyPerson } from "./PersonFields";
import {
  insertRegistration,
  checkEmail,
  type PersonInput,
  type RegistrationPayload,
} from "@/app/[locale]/register/actions";

const labelClass = "block text-sm font-medium text-slate-700";
const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

export function RegistrationForm() {
  const t = useTranslations("Register");
  const tc = useTranslations("Common");
  const tf = useTranslations("Fields");
  const locale = useLocale();

  const [phase, setPhase] = useState<"email" | "form">("email");
  const [mode, setMode] = useState<"individual" | "household">("individual");
  const [email, setEmail] = useState("");
  const [householder, setHouseholder] = useState<PersonInput>(emptyPerson());
  const [members, setMembers] = useState<PersonInput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const [token, setToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const needsCaptcha = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  // 1단계: 이메일 확인
  const [emailError, setEmailError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const [checking, startCheck] = useTransition();

  function resetCaptcha() {
    setToken(null);
    setCaptchaKey((k) => k + 1);
  }

  function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailError(null);
    setRegistered(false);
    startCheck(async () => {
      const res = await checkEmail(email);
      if (!res.ok) {
        setEmailError(res.error);
        return;
      }
      if (res.registered) {
        setRegistered(true);
        return;
      }
      setPhase("form");
    });
  }

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
    const payload: RegistrationPayload = {
      mode,
      email,
      householder,
      members: mode === "household" ? members : [],
    };
    startTransition(async () => {
      const result = await insertRegistration(payload, token);
      if (result.ok) {
        setDone(true);
      } else {
        setError(result.error);
        resetCaptcha();
      }
    });
  }

  if (done) {
    return (
      <div className="rounded-xl bg-emerald-50 p-6 ring-1 ring-emerald-200">
        <p className="text-lg font-semibold text-emerald-800">{t("success")}</p>
        <p className="mt-2 text-sm text-emerald-700">{t("successEditHint")}</p>
      </div>
    );
  }

  // ── 1단계: 이메일 확인 ──
  if (phase === "email") {
    return (
      <form onSubmit={submitEmail} className="space-y-4">
        <div>
          <label className={labelClass}>
            {tf("email")} <span className="text-rose-500">*</span>
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setRegistered(false);
              setEmailError(null);
            }}
            className={inputClass}
            placeholder="you@example.com"
          />
          <p className="mt-1 text-xs text-slate-500">{t("emailStepHint")}</p>
        </div>

        {emailError && (
          <p className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
            {t(emailError)}
          </p>
        )}

        {registered ? (
          <div className="rounded-xl bg-amber-50 p-5 ring-1 ring-amber-200">
            <p className="text-base font-semibold text-amber-900">
              {t("alreadyTitle")}
            </p>
            <p className="mt-1 text-sm text-amber-800">{t("alreadyHint")}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link
                href="/edit"
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                {t("goToEdit")}
              </Link>
              <button
                type="button"
                onClick={() => {
                  setRegistered(false);
                  setEmail("");
                }}
                className="text-sm font-medium text-slate-500 hover:text-slate-700"
              >
                {t("useAnotherEmail")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="submit"
            disabled={checking}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
          >
            {checking ? t("checking") : t("next")}
          </button>
        )}
      </form>
    );
  }

  // ── 2단계: 등록 폼 ──
  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* 확인된 이메일 (읽기전용) */}
      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
        <div>
          <p className="text-xs text-slate-500">{t("emailReadonlyNote")}</p>
          <p className="text-sm font-medium text-slate-800">{email}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setPhase("email");
            resetCaptcha();
          }}
          className="text-sm font-medium text-emerald-700 hover:text-emerald-800"
        >
          {t("changeEmail")}
        </button>
      </div>

      {/* 등록 방식 선택 */}
      <fieldset>
        <legend className={labelClass}>{t("mode")}</legend>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="mode"
              checked={mode === "individual"}
              onChange={() => setMode("individual")}
            />
            {t("modeIndividual")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="mode"
              checked={mode === "household"}
              onChange={() => setMode("household")}
            />
            {t("modeHousehold")}
          </label>
        </div>
      </fieldset>

      {/* 가구주 / 개인 */}
      <section className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="mb-4 text-base font-semibold text-slate-900">
          {mode === "household" ? t("householderSection") : t("modeIndividual")}
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
            {t("familySection")}
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
                  {t("removeMember")}
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
            + {t("addMember")}
          </button>
        </section>
      )}

      {error && (
        <p className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {t(error)}
        </p>
      )}

      <TurnstileWidget
        key={captchaKey}
        onVerify={setToken}
        onExpire={() => setToken(null)}
        locale={locale}
      />

      <button
        type="submit"
        disabled={pending || (needsCaptcha && !token)}
        className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? tc("submitting") : tc("submit")}
      </button>
    </form>
  );
}
