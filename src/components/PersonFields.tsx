"use client";

import { useTranslations } from "next-intl";
import {
  DISTRICTS,
  GENDERS,
  ROLES,
  RETREAT_START,
  RETREAT_END,
  type Attendance,
} from "@/lib/types";
import type { PersonInput } from "@/app/[locale]/register/actions";

const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";
const labelClass = "block text-sm font-medium text-slate-700";

export function PersonFields({
  value,
  onChange,
  groupId,
  showContact = false,
}: {
  value: PersonInput;
  onChange: (patch: Partial<PersonInput>) => void;
  // radio 그룹을 사람별로 구분하기 위한 안정적인 id
  groupId: string;
  // 가구주/개인은 연락처(phone) 노출, 가족 구성원은 선택
  showContact?: boolean;
}) {
  const t = useTranslations("Fields");
  const tg = useTranslations("Gender");
  const tr = useTranslations("Role");
  const td = useTranslations("District");
  const ta = useTranslations("Attendance");

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label className={labelClass}>{t("korean_name")}</label>
        <input
          type="text"
          value={value.korean_name}
          onChange={(e) => onChange({ korean_name: e.target.value })}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>{t("english_name")}</label>
        <input
          type="text"
          value={value.english_name ?? ""}
          onChange={(e) => onChange({ english_name: e.target.value })}
          className={inputClass}
        />
      </div>

      <p className="-mt-2 text-xs text-slate-500 sm:col-span-2">{t("nameHint")}</p>

      <div>
        <label className={labelClass}>{t("district")}</label>
        <select
          value={value.district ?? ""}
          onChange={(e) => onChange({ district: e.target.value })}
          className={inputClass}
        >
          <option value="">—</option>
          {DISTRICTS.map((d) => (
            <option key={d} value={d}>
              {td(d)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>{t("role")}</label>
        <select
          value={value.role ?? ""}
          onChange={(e) =>
            onChange({ role: e.target.value as PersonInput["role"] })
          }
          className={inputClass}
        >
          <option value="">—</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {tr(r)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>{t("gender")}</label>
        <select
          value={value.gender ?? ""}
          onChange={(e) =>
            onChange({ gender: e.target.value as PersonInput["gender"] })
          }
          className={inputClass}
        >
          <option value="">—</option>
          {GENDERS.map((g) => (
            <option key={g} value={g}>
              {tg(g)}
            </option>
          ))}
        </select>
      </div>

      {showContact && (
        <div>
          <label className={labelClass}>{t("phone")}</label>
          <input
            type="tel"
            value={value.phone ?? ""}
            onChange={(e) => onChange({ phone: e.target.value })}
            className={inputClass}
          />
        </div>
      )}

      <div className="sm:col-span-2">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={!!value.is_under_6}
            onChange={(e) => onChange({ is_under_6: e.target.checked })}
          />
          {t("is_under_6")}
        </label>
      </div>

      <div className="sm:col-span-2">
        <label className={labelClass}>{t("attendance")}</label>
        <div className="mt-1 flex gap-4">
          {(["full", "partial"] as Attendance[]).map((a) => (
            <label key={a} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`attendance-${groupId}`}
                checked={value.attendance === a}
                onChange={() => onChange({ attendance: a })}
              />
              {ta(a)}
            </label>
          ))}
        </div>
      </div>

      {value.attendance === "partial" && (
        <>
          <div>
            <label className={labelClass}>{t("arrival_at")}</label>
            <input
              type="date"
              min={RETREAT_START}
              max={RETREAT_END}
              value={value.arrival_at ?? ""}
              onChange={(e) => onChange({ arrival_at: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{t("departure_at")}</label>
            <input
              type="date"
              min={RETREAT_START}
              max={RETREAT_END}
              value={value.departure_at ?? ""}
              onChange={(e) => onChange({ departure_at: e.target.value })}
              className={inputClass}
            />
          </div>
          <p className="-mt-2 text-xs text-slate-500 sm:col-span-2">
            {t("partialDateHint")}
          </p>
        </>
      )}

      <div className="sm:col-span-2">
        <label className={labelClass}>{t("note")}</label>
        <textarea
          rows={2}
          value={value.note ?? ""}
          onChange={(e) => onChange({ note: e.target.value })}
          className={inputClass}
        />
      </div>
    </div>
  );
}

export const emptyPerson = (): PersonInput => ({
  korean_name: "",
  english_name: "",
  district: "",
  gender: "",
  role: "",
  phone: "",
  is_under_6: false,
  attendance: "full",
  arrival_at: "",
  departure_at: "",
  note: "",
});
