import { useTranslations } from "next-intl";
import { formatUSD } from "@/lib/fees";
import type { DashboardStats } from "@/lib/dashboard";

// 카드 색 = 영역(등록/언어/방/회비)을 구분하는 정보. 정적 클래스 문자열(Tailwind 스캔용).
const TONES = {
  emerald: {
    card: "bg-emerald-50 ring-emerald-100",
    eyebrow: "text-emerald-700",
    hero: "text-emerald-800",
    bar: "bg-emerald-500",
    track: "bg-emerald-100",
  },
  indigo: {
    card: "bg-indigo-50 ring-indigo-100",
    eyebrow: "text-indigo-700",
    hero: "text-indigo-800",
    bar: "bg-indigo-500",
    track: "bg-indigo-100",
  },
  sky: {
    card: "bg-sky-50 ring-sky-100",
    eyebrow: "text-sky-700",
    hero: "text-sky-800",
    bar: "bg-sky-500",
    track: "bg-sky-100",
  },
  amber: {
    card: "bg-amber-50 ring-amber-100",
    eyebrow: "text-amber-700",
    hero: "text-amber-800",
    bar: "bg-amber-500",
    track: "bg-amber-100",
  },
} as const;

type Tone = keyof typeof TONES;

function pct(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

function Bar({
  value,
  total,
  tone,
}: {
  value: number;
  total: number;
  tone: Tone;
}) {
  const t = TONES[tone];
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full ${t.track}`}>
      <div
        className={`h-full rounded-full ${t.bar}`}
        style={{ width: `${pct(value, total)}%` }}
      />
    </div>
  );
}

function Card({
  tone,
  title,
  children,
}: {
  tone: Tone;
  title: string;
  children: React.ReactNode;
}) {
  const t = TONES[tone];
  return (
    <section className={`rounded-2xl p-5 ring-1 ${t.card}`}>
      <h2
        className={`text-xs font-semibold uppercase tracking-wide ${t.eyebrow}`}
      >
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function AdminDashboard({ stats }: { stats: DashboardStats }) {
  const t = useTranslations("Admin");
  const tl = useTranslations("Language");
  const td = useTranslations("District");
  const tr = useTranslations("Role");

  const languages = [
    { key: "ko", count: stats.language.ko },
    { key: "en", count: stats.language.en },
    { key: "es", count: stats.language.es },
  ];
  const langMax = Math.max(1, ...languages.map((l) => l.count));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* 등록 현황 */}
        <Card tone="emerald" title={t("dashRegistration")}>
          <p className="text-4xl font-bold text-emerald-800">
            {stats.totalPeople}
          </p>
          <p className="mt-2 text-sm text-emerald-700">
            {t("dashFull")} {stats.full} · {t("dashPartial")} {stats.partial}
          </p>
        </Card>

        {/* 언어별 분포 */}
        <Card tone="indigo" title={t("dashLanguage")}>
          <ul className="space-y-2">
            {languages.map((l) => (
              <li key={l.key}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-indigo-900">{tl(l.key)}</span>
                  <span className="font-semibold text-indigo-800">
                    {l.count}
                  </span>
                </div>
                <div className="mt-1">
                  <Bar value={l.count} total={langMax} tone="indigo" />
                </div>
              </li>
            ))}
          </ul>
        </Card>

        {/* 방 배정 현황 */}
        <Card tone="sky" title={t("dashRooms")}>
          <div className="flex items-baseline gap-2">
            <p className="text-4xl font-bold text-sky-800">{stats.assigned}</p>
            <p className="text-sm text-sky-700">{t("dashAssigned")}</p>
            {stats.unassigned > 0 && (
              <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                {t("dashUnassigned")} {stats.unassigned}
              </span>
            )}
          </div>
          <ul className="mt-3 space-y-2">
            {stats.rooms.map((r) => (
              <li key={r.name}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-sky-900">
                    {r.name}{" "}
                    <span className="text-sky-600/60">({r.roomCount})</span>
                  </span>
                  <span
                    className={`font-medium ${r.occupied > r.capacityTotal ? "text-rose-600" : "text-sky-800"}`}
                  >
                    {r.occupied}/{r.capacityTotal}
                  </span>
                </div>
                <div className="mt-1">
                  <Bar value={r.occupied} total={r.capacityTotal} tone="sky" />
                </div>
              </li>
            ))}
          </ul>
        </Card>

        {/* 회비 현황 */}
        <Card tone="amber" title={t("dashFees")}>
          <p className="text-3xl font-bold text-amber-800">
            {formatUSD(stats.paidTotal)}
          </p>
          <p className="mt-1 text-sm text-amber-700">
            / {formatUSD(stats.grandTotal)} {t("dashExpected")}
          </p>
          <div className="mt-2">
            <Bar value={stats.paidTotal} total={stats.grandTotal} tone="amber" />
          </div>
          <div className="mt-3 flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm">
            <span className="text-amber-700">
              {t("dashUnpaid")}{" "}
              <span className="font-medium text-amber-900">
                {formatUSD(stats.unpaidTotal)}
              </span>
            </span>
            <span className="text-amber-700">
              {t("dashPaidHouseholds")}{" "}
              <span className="font-medium text-amber-900">
                {stats.paidHouseholds}/{stats.households}
              </span>
            </span>
          </div>
        </Card>
      </div>

      {/* 보조: 구역별 · 직분별 (중립 카드, 칩 목록) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("dashByDistrict")}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {stats.byDistrict.length === 0 && (
              <li className="text-sm text-slate-400">—</li>
            )}
            {stats.byDistrict.map((d) => (
              <li
                key={d.key}
                className="rounded-lg bg-slate-50 px-2.5 py-1 text-sm text-slate-700"
              >
                {td(d.key)}{" "}
                <span className="font-semibold text-slate-900">{d.count}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("dashByRole")}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {stats.byRole.length === 0 && (
              <li className="text-sm text-slate-400">—</li>
            )}
            {stats.byRole.map((r) => (
              <li
                key={r.key}
                className="rounded-lg bg-slate-50 px-2.5 py-1 text-sm text-slate-700"
              >
                {tr(r.key)}{" "}
                <span className="font-semibold text-slate-900">{r.count}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
