import { useTranslations } from "next-intl";
import { formatUSD } from "@/lib/fees";

export function HouseholdFeeCard({
  total,
  typeSelected,
  paid,
  payUrl = null,
}: {
  total: number;
  typeSelected: boolean;
  paid: boolean;
  payUrl?: string | null;
}) {
  const t = useTranslations("Fee");

  return (
    <div className="mb-8 rounded-2xl bg-pine p-6 text-ivory ring-1 ring-pine-deep">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ivory/70">{t("title")}</p>
          <p className="font-display mt-1 text-3xl font-bold text-gold">
            {formatUSD(total)}
          </p>
        </div>
        <span
          className={
            paid
              ? "rounded-full bg-gold px-3 py-1 text-sm font-semibold text-pine-deep"
              : "rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-ivory ring-1 ring-ivory/30"
          }
        >
          {paid ? t("paid") : t("unpaid")}
        </span>
      </div>
      {!typeSelected && (
        <p className="mt-3 text-xs text-ivory/60">{t("selectTypeNotice")}</p>
      )}
      {payUrl && (
        <div className="mt-5">
          <a
            href={payUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-full bg-gold px-5 py-3 text-center text-sm font-semibold text-pine-deep transition hover:brightness-105"
          >
            {t("payWithPaypal", { amount: formatUSD(total) })}
          </a>
          <p className="mt-2 text-center text-xs text-ivory/60">
            {t("payNotice")}
          </p>
        </div>
      )}
    </div>
  );
}
