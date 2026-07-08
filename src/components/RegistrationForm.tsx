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
  checkName,
  requestEmail,
  type PersonInput,
  type RegistrationPayload,
} from "@/app/[locale]/register/actions";

const labelClass = "block text-sm font-medium text-slate-700";
const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";
const tabActiveClass =
  "flex-1 rounded-md bg-white px-3 py-2 text-center font-semibold text-emerald-700 shadow-sm";
const tabIdleClass =
  "flex-1 rounded-md px-3 py-2 text-center text-slate-500 hover:text-slate-700";

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

  // 1단계: 이름으로 확인 (확인 전용 — 폼 진행은 이메일 탭에서만)
  const [checkTab, setCheckTab] = useState<"email" | "name">("email");
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameResult, setNameResult] = useState<{
    matched: boolean;
    maskedEmails: string[];
  } | null>(null);

  // 이메일 없음 카드: 본인 이메일 신청
  const [reqEmail, setReqEmail] = useState("");
  const [reqPhone, setReqPhone] = useState("");
  const [reqError, setReqError] = useState<string | null>(null);
  const [reqDone, setReqDone] = useState(false);

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

  function submitName(e: React.FormEvent) {
    e.preventDefault();
    setNameError(null);
    setNameResult(null);
    startCheck(async () => {
      const res = await checkName(nameInput);
      if (!res.ok) {
        setNameError(res.error);
        return;
      }
      setNameResult({ matched: res.matched, maskedEmails: res.maskedEmails });
    });
  }

  function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    setReqError(null);
    const submittedName = nameInput;
    startCheck(async () => {
      const res = await requestEmail(submittedName, reqEmail, reqPhone);
      if (nameInput !== submittedName) return; // 이름이 바뀌었으면 stale 결과 무시
      if (!res.ok) {
        setReqError(res.error);
        return;
      }
      setReqDone(true);
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

  // ── 1단계: 등록 여부 확인 (이메일/이름 탭) ──
  if (phase === "email") {
    return (
      <div className="space-y-4">
        <div role="tablist" className="flex rounded-lg bg-slate-100 p-1 text-sm">
          <button
            type="button"
            role="tab"
            id="check-tab-email"
            aria-selected={checkTab === "email"}
            aria-controls="check-panel"
            onClick={() => setCheckTab("email")}
            className={checkTab === "email" ? tabActiveClass : tabIdleClass}
          >
            {t("tabEmail")}
          </button>
          <button
            type="button"
            role="tab"
            id="check-tab-name"
            aria-selected={checkTab === "name"}
            aria-controls="check-panel"
            onClick={() => setCheckTab("name")}
            className={checkTab === "name" ? tabActiveClass : tabIdleClass}
          >
            {t("tabName")}
          </button>
        </div>

        {checkTab === "email" ? (
          <form
            onSubmit={submitEmail}
            id="check-panel"
            role="tabpanel"
            aria-labelledby="check-tab-email"
            className="space-y-4"
          >
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
              <p className="mt-1 text-xs text-slate-500">
                {t("emailStepHint")}
              </p>
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
                <p className="mt-1 text-sm text-amber-800">
                  {t("alreadyHint")}
                </p>
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
        ) : (
          <form
            onSubmit={submitName}
            id="check-panel"
            role="tabpanel"
            aria-labelledby="check-tab-name"
            className="space-y-4"
          >
            <div>
              <label className={labelClass}>
                {t("nameLabel")} <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={nameInput}
                onChange={(e) => {
                  setNameInput(e.target.value);
                  setNameResult(null);
                  setNameError(null);
                  setReqError(null);
                  setReqDone(false);
                  setReqEmail("");
                  setReqPhone("");
                }}
                className={inputClass}
                placeholder="김철수 / John Kim"
              />
              <p className="mt-1 text-xs text-slate-500">
                {t("nameStepHint")}
              </p>
            </div>

            {nameError && (
              <p className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
                {t(nameError)}
              </p>
            )}

            {nameResult?.matched ? (
              <div className="rounded-xl bg-amber-50 p-5 ring-1 ring-amber-200">
                <p className="text-base font-semibold text-amber-900">
                  {t("nameFoundTitle")}
                </p>
                {nameResult.maskedEmails.length > 0 ? (
                  <>
                    <p className="mt-1 text-sm text-amber-800">
                      {t("nameFoundHint")}
                    </p>
                    <ul className="mt-2 space-y-1">
                      {nameResult.maskedEmails.map((m) => (
                        <li key={m} className="font-mono text-sm text-amber-900">
                          {m}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4">
                      <Link
                        href="/edit"
                        className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                      >
                        {t("goToEdit")}
                      </Link>
                    </div>
                  </>
                ) : reqDone ? (
                  <p className="mt-1 text-sm text-amber-800">
                    {t("requestEmailDone")}
                  </p>
                ) : (
                  <div className="mt-2 space-y-3">
                    <p className="text-sm text-amber-800">
                      {t("requestEmailIntro")}
                    </p>
                    <div className="space-y-2">
                      <input
                        type="email"
                        required
                        value={reqEmail}
                        onChange={(e) => {
                          setReqEmail(e.target.value);
                          setReqError(null);
                        }}
                        className={inputClass}
                        placeholder="you@example.com"
                        aria-label={tf("email")}
                      />
                      <input
                        type="tel"
                        value={reqPhone}
                        onChange={(e) => setReqPhone(e.target.value)}
                        className={inputClass}
                        placeholder={t("requestPhoneLabel")}
                        aria-label={t("requestPhoneLabel")}
                      />
                      <p className="text-xs text-amber-700">
                        {t("requestPhoneHint")}
                      </p>
                    </div>
                    {reqError && (
                      <p className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
                        {t(reqError)}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={submitRequest}
                      disabled={checking}
                      className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {checking ? tc("submitting") : t("requestEmailSubmit")}
                    </button>
                    <p className="text-xs text-amber-700">
                      {t("nameFoundNoEmailHint")}
                    </p>
                  </div>
                )}
              </div>
            ) : nameResult ? (
              <div className="rounded-xl bg-slate-50 p-5 ring-1 ring-slate-200">
                <p className="text-base font-semibold text-slate-800">
                  {t("nameNotFoundTitle")}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {t("nameNotFoundHint")}
                </p>
                <button
                  type="button"
                  onClick={() => setCheckTab("email")}
                  className="mt-4 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  {t("goRegisterByEmail")}
                </button>
              </div>
            ) : (
              <button
                type="submit"
                disabled={checking}
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
              >
                {checking ? t("checking") : t("checkName")}
              </button>
            )}
          </form>
        )}
      </div>
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
