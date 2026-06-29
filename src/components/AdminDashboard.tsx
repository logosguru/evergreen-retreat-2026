import { useTranslations } from "next-intl";
import { formatUSD } from "@/lib/fees";
import type { DashboardStats } from "@/lib/dashboard";

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-sm font-semibold text-slate-500">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div>
      <div className={`text-2xl font-bold ${accent ?? "text-slate-900"}`}>
        {value}
      </div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

export function AdminDashboard({ stats }: { stats: DashboardStats }) {
  const t = useTranslations("Admin");
  const tl = useTranslations("Language");
  const td = useTranslations("District");
  const tr = useTranslations("Role");

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card title={t("dashRegistration")}>
        <div className="grid grid-cols-3 gap-3">
          <Stat label={t("dashTotal")} value={stats.totalPeople} />
          <Stat label={t("dashHouseholds")} value={stats.households} />
          <Stat label={t("under6")} value={stats.under6} />
          <Stat label={t("dashFull")} value={stats.full} />
          <Stat label={t("dashPartial")} value={stats.partial} />
        </div>
      </Card>

      <Card title={t("dashLanguage")}>
        <div className="grid grid-cols-3 gap-3">
          <Stat label={tl("ko")} value={stats.language.ko} />
          <Stat label={tl("en")} value={stats.language.en} />
          <Stat label={tl("es")} value={stats.language.es} />
        </div>
      </Card>

      <Card title={t("dashRooms")}>
        <div className="grid grid-cols-2 gap-3">
          <Stat label={t("dashAssigned")} value={stats.assigned} />
          <Stat
            label={t("dashUnassigned")}
            value={stats.unassigned}
            accent={stats.unassigned > 0 ? "text-amber-600" : undefined}
          />
        </div>
        <ul className="mt-3 space-y-1 text-sm text-slate-600">
          {stats.rooms.map((r) => (
            <li key={r.name} className="flex justify-between">
              <span>
                {r.name}{" "}
                <span className="text-slate-400">({r.roomCount})</span>
              </span>
              <span
                className={r.occupied > r.capacityTotal ? "text-rose-600" : ""}
              >
                {r.occupied}/{r.capacityTotal}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={t("dashFees")}>
        <div className="grid grid-cols-2 gap-3">
          <Stat label={t("dashExpected")} value={formatUSD(stats.grandTotal)} />
          <Stat
            label={t("dashPaid")}
            value={formatUSD(stats.paidTotal)}
            accent="text-emerald-600"
          />
          <Stat
            label={t("dashUnpaid")}
            value={formatUSD(stats.unpaidTotal)}
            accent={stats.unpaidTotal > 0 ? "text-amber-600" : undefined}
          />
          <Stat
            label={t("dashPaidHouseholds")}
            value={`${stats.paidHouseholds}/${stats.households}`}
          />
        </div>
      </Card>

      <Card title={t("dashByDistrict")}>
        <ul className="space-y-1 text-sm text-slate-600">
          {stats.byDistrict.length === 0 && (
            <li className="text-slate-400">—</li>
          )}
          {stats.byDistrict.map((d) => (
            <li key={d.key} className="flex justify-between">
              <span>{td(d.key)}</span>
              <span>{d.count}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title={t("dashByRole")}>
        <ul className="space-y-1 text-sm text-slate-600">
          {stats.byRole.length === 0 && <li className="text-slate-400">—</li>}
          {stats.byRole.map((r) => (
            <li key={r.key} className="flex justify-between">
              <span>{tr(r.key)}</span>
              <span>{r.count}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
