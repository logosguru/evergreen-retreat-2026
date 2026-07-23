import { useTranslations, useLocale } from "next-intl";
import { formatUSD } from "@/lib/fees";
import type { FeePayment } from "@/lib/types";

export function HouseholdFeeCard({
  total,
  balance,
  typeSelected,
  payUrl = null,
  payments = [],
}: {
  total: number;
  balance: number; // total - paid_total. 양수=추가납부, 음수=환불
  typeSelected: boolean;
  payUrl?: string | null;
  payments?: FeePayment[];
}) {
  const t = useTranslations("Fee");
  const locale = useLocale();
  const dateFmt = new Intl.DateTimeFormat(
    locale === "en" ? "en-US" : locale === "es" ? "es-ES" : "ko-KR",
    { year: "numeric", month: "short", day: "numeric" },
  );

  const settled = total > 0 && balance <= 0;
  const owe = balance > 0;
  const refund = balance < 0;

  const methodLabel = (m: string | null) => {
    switch (m) {
      case "paypal":
        return t("methodPaypal");
      case "cash":
        return t("methodCash");
      case "check":
        return t("methodCheck");
      case "import":
        return t("methodImport");
      default:
        return m ?? "";
    }
  };

  return (
    <div className="mb-8 rounded-2xl bg-pine p-6 text-ivory ring-1 ring-pine-deep">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ivory/70">{t("total")}</p>
          <p className="font-display mt-1 text-3xl font-bold text-gold">
            {formatUSD(total)}
          </p>
        </div>
        <span
          className={
            settled
              ? "rounded-full bg-gold px-3 py-1 text-sm font-semibold text-pine-deep"
              : "rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-ivory ring-1 ring-ivory/30"
          }
        >
          {settled ? t("paid") : owe ? t("balanceOwe") : t("unpaid")}
        </span>
      </div>

      {!typeSelected && (
        <p className="mt-3 text-xs text-ivory/60">{t("selectTypeNotice")}</p>
      )}

      {owe && (
        <p className="mt-3 text-sm text-ivory/80">
          {t("balanceOwe")}: <span className="font-semibold text-gold">{formatUSD(balance)}</span>
        </p>
      )}

      {refund && (
        <div className="mt-3 rounded-lg bg-white/10 px-4 py-3 text-sm">
          <span className="font-semibold text-gold">
            {t("balanceRefund")}: {formatUSD(-balance)}
          </span>
          <p className="mt-1 text-xs text-ivory/60">{t("balanceRefundNote")}</p>
        </div>
      )}

      {payUrl && owe && (
        <div className="mt-5">
          <a
            href={payUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-full bg-gold px-5 py-3 text-center text-sm font-semibold text-pine-deep transition hover:brightness-105"
          >
            {t("payBalanceWithPaypal", { amount: formatUSD(balance) })}
          </a>
          <p className="mt-2 text-center text-xs text-ivory/60">{t("payNotice")}</p>
        </div>
      )}

      {payments.length > 0 && (
        <div className="mt-5 border-t border-ivory/15 pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ivory/60">
            {t("paymentHistory")}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-ivory/85">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <span>
                  {/* date-only는 정오 기준 파싱 — UTC 자정 해석으로 하루 밀리는 것 방지 */}
                  {dateFmt.format(new Date(`${p.paid_at}T12:00:00`))}
                  {p.method ? ` · ${methodLabel(p.method)}` : ""}
                </span>
                <span className={p.amount < 0 ? "text-rose-300" : "text-ivory"}>
                  {p.amount < 0 ? `-${formatUSD(-p.amount)}` : formatUSD(p.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
