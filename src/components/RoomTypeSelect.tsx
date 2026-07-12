"use client";

import { useTranslations } from "next-intl";
import type { RoomType } from "@/lib/types";
import { formatUSD } from "@/lib/fees";

export function RoomTypeSelect({
  roomTypes,
  value,
  onChange,
  disabled = false,
  className,
}: {
  roomTypes: RoomType[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations("Fee");
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={className}
    >
      <option value="">{t("roomTypePlaceholder")}</option>
      {roomTypes.map((rt) => (
        <option key={rt.id} value={rt.id}>
          {rt.name} · {formatUSD(rt.price_per_person)}
          {t("perPersonSuffix")}
        </option>
      ))}
    </select>
  );
}
