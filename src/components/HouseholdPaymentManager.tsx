"use client";

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { addPayment, deletePayment } from "@/app/[locale]/admin/actions";
import { formatUSD, householdBalance } from "@/lib/fees";
import { PAYMENT_METHODS, type FeePayment } from "@/lib/types";

const inputClass =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

export function HouseholdPaymentManager({
  headId,
  total,
  payments,
}: {
  headId: string;
  total: number;
  payments: FeePayment[];
}) {
  const t = useTranslations("Admin");
  const tf = useTranslations("Fee");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();

  const paidTotal = payments.reduce((s, p) => s + p.amount, 0);
  const balance = householdBalance(total, paidTotal);

  const dateFmt = new Intl.DateTimeFormat(
    locale === "en" ? "en-US" : locale === "es" ? "es-ES" : "ko-KR",
    { year: "numeric", month: "short", day: "numeric" },
  );

  // 폼 상태. 금액 기본값 = 현재 잔액(양수면 납입 기본).
  const [amount, setAmount] = useState<string>(
    balance > 0 ? String(balance) : "",
  );
  const [method, setMethod] = useState<string>("paypal");
  const [paidAt, setPaidAt] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [error, setError] = useState(false);

  const methodLabel = (m: string) =>
    m === "paypal"
      ? tf("methodPaypal")
      : m === "cash"
        ? tf("methodCash")
        : m === "check"
          ? tf("methodCheck")
          : m === "import"
            ? tf("methodImport")
            : m;

  function submit(sign: 1 | -1) {
    // 버튼(납입=+1/환불=-1)이 부호를 결정한다. 입력값의 부호는 무시(abs)해
    // 음수 입력 + '납입 기록'이 환불로 잘못 기록되는 것을 막는다.
    const n = Math.abs(Math.round(Number(amount))) * sign;
    if (!Number.isFinite(n) || n === 0 || !paidAt) {
      setError(true);
      return;
    }
    setError(false);
    start(async () => {
      const r = await addPayment({
        headId,
        amount: n,
        method: method || null,
        paidAt,
        note: note || null,
      });
      if (r.ok) {
        setAmount("");
        setNote("");
        router.refresh();
      } else {
        setError(true);
      }
    });
  }

  function remove(id: string) {
    if (!window.confirm(t("confirmDeletePayment"))) return;
    start(async () => {
      const r = await deletePayment(id);
      if (r.ok) {
        router.refresh();
      } else {
        setError(true);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* 요약 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <p className="text-xs text-slate-500">{t("paymentTotal")}</p>
          <p className="mt-1 text-xl font-bold text-slate-900">
            {formatUSD(total)}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <p className="text-xs text-slate-500">{t("paymentPaid")}</p>
          <p className="mt-1 text-xl font-bold text-slate-900">
            {formatUSD(paidTotal)}
          </p>
        </div>
        <div
          className={`rounded-xl p-4 ring-1 ${
            balance > 0
              ? "bg-amber-50 ring-amber-200"
              : balance < 0
                ? "bg-rose-50 ring-rose-200"
                : "bg-emerald-50 ring-emerald-200"
          }`}
        >
          <p className="text-xs text-slate-500">{t("paymentBalance")}</p>
          <p
            className={`mt-1 text-xl font-bold ${
              balance > 0
                ? "text-amber-800"
                : balance < 0
                  ? "text-rose-700"
                  : "text-emerald-700"
            }`}
          >
            {balance < 0 ? `-${formatUSD(-balance)}` : formatUSD(balance)}
          </p>
        </div>
      </div>

      {/* 납입 내역 */}
      <div className="rounded-xl ring-1 ring-slate-200">
        <p className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("paymentListTitle")}
        </p>
        {payments.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500">{t("paymentEmpty")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {payments.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
              >
                <span className="text-slate-600">
                  {/* date-only는 정오 기준 파싱 — UTC 자정 해석으로 하루 밀리는 것 방지 */}
                  {dateFmt.format(new Date(`${p.paid_at}T12:00:00`))}
                  {p.method ? ` · ${methodLabel(p.method)}` : ""}
                  {p.note ? ` · ${p.note}` : ""}
                </span>
                <span className="flex items-center gap-3">
                  <span
                    className={
                      p.amount < 0
                        ? "font-medium text-rose-700"
                        : "font-medium text-slate-900"
                    }
                  >
                    {p.amount < 0
                      ? `-${formatUSD(-p.amount)}`
                      : formatUSD(p.amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    disabled={pending}
                    className="text-xs text-slate-400 hover:text-rose-600 disabled:opacity-60"
                  >
                    {t("deletePayment")}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 기록 폼 */}
      <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              {t("paymentAmount")}
            </label>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              {t("paymentMethod")}
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className={inputClass}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {methodLabel(m)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              {t("paymentDate")}
            </label>
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              {t("paymentNote")}
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => submit(1)}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {t("recordPayment")}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => submit(-1)}
            className="rounded-lg bg-rose-100 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-200 disabled:opacity-60"
          >
            {t("recordRefund")}
          </button>
          {error && (
            <span className="text-sm text-rose-700">{t("paymentError")}</span>
          )}
        </div>
      </div>
    </div>
  );
}
