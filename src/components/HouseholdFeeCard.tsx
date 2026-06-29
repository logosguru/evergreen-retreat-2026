import { useTranslations } from "next-intl";
import { formatUSD } from "@/lib/fees";

export function HouseholdFeeCard({
  total,
  unassignedCount,
  paid,
}: {
  total: number;
  unassignedCount: number;
  paid: boolean;
}) {
  const t = useTranslations("Fee");

  return (
    <div className="mb-8 rounded-xl bg-emerald-50 p-5 ring-1 ring-emerald-200">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-800">{t("title")}</p>
          <p className="mt-1 text-2xl font-bold text-emerald-900">
            {formatUSD(total)}
          </p>
        </div>
        <span
          className={
            paid
              ? "rounded-full bg-emerald-600 px-3 py-1 text-sm font-medium text-white"
              : "rounded-full bg-white px-3 py-1 text-sm font-medium text-emerald-700 ring-1 ring-emerald-300"
          }
        >
          {paid ? t("paid") : t("unpaid")}
        </span>
      </div>
      {unassignedCount > 0 && (
        <p className="mt-2 text-xs text-emerald-700">
          {t("unassignedNotice", { count: unassignedCount })}
        </p>
      )}
    </div>
  );
}
