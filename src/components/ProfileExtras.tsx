import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { Star, Trash2, Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  fetchSellerDashboard,
  fetchPriceAlerts,
  deletePriceAlert,
  fetchMallGeo,
  type SellerDashboard,
  type PriceAlertRow,
  type MallGeo,
} from "@/lib/user-prefs";

/* ---------------- Feature 2: Seller dashboard ---------------- */

export function SellerDashboardSection({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const [data, setData] = useState<SellerDashboard | null>(null);

  useEffect(() => {
    fetchSellerDashboard(userId).then(setData).catch(() => {});
  }, [userId]);

  if (!data) return null;

  if (data.totalSales === 0) {
    return (
      <div className="bg-card rounded-2xl shadow-[var(--shadow-card)] p-4 space-y-2">
        <div className="text-sm font-bold">📊 {t("dashboard.title")}</div>
        <div className="text-xs text-muted-foreground py-4 text-center">{t("dashboard.noSales")}</div>
      </div>
    );
  }

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const chartData = data.monthly.map((m) => ({
    label: monthNames[Number(m.month.slice(5)) - 1] ?? m.month.slice(5),
    earned: Math.round(m.earned),
  }));

  return (
    <div className="bg-card rounded-2xl shadow-[var(--shadow-card)] p-4 space-y-3">
      <div className="text-sm font-bold">📊 {t("dashboard.title")}</div>
      <div className="grid grid-cols-2 gap-3">
        <MiniStat label={t("dashboard.totalEarned")} value={`HK$${data.totalEarned.toFixed(0)}`} tone="text-success" />
        <MiniStat label={t("dashboard.totalSales")} value={String(data.totalSales)} tone="text-primary" />
        <MiniStat
          label={t("dashboard.avgRating")}
          value={data.avgRating != null ? data.avgRating.toFixed(1) : "—"}
          tone="text-warning"
          icon={<Star className="w-3 h-3 fill-warning text-warning" />}
        />
        <MiniStat label={t("dashboard.topMall")} value={data.topMall ?? "—"} tone="text-foreground" />
      </div>

      <div>
        <div className="text-[11px] font-semibold text-muted-foreground mb-1">
          {t("dashboard.monthlyEarnings")}
        </div>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(v: any) => [`HK$${v}`, t("dashboard.totalEarned")]}
              />
              <Bar dataKey="earned" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone, icon }: { label: string; value: string; tone: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-accent rounded-xl p-3">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`font-bold text-sm truncate flex items-center gap-1 ${tone}`}>
        {icon}
        {value}
      </div>
    </div>
  );
}

/* ---------------- Feature 4 + 5: Waitlist & price alerts ---------------- */

export function WaitlistAndAlertsSection({
  userId,
  onOpenAlertSheet,
}: {
  userId: string;
  onOpenAlertSheet: () => void;
}) {
  const { t } = useTranslation();
  const [malls, setMalls] = useState<MallGeo[]>([]);
  const [alerts, setAlerts] = useState<PriceAlertRow[]>([]);

  async function reload() {
    const al = await fetchPriceAlerts(userId);
    setAlerts(al);
  }

  useEffect(() => {
    fetchMallGeo().then(setMalls).catch(() => {});
    reload().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const mallName = (id: number) => malls.find((m) => m.id === id)?.name ?? `#${id}`;

  return (
    <div className="bg-card rounded-2xl shadow-[var(--shadow-card)] p-4 space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-bold flex items-center gap-1.5">
            <Bell className="w-4 h-4 text-primary" /> {t("alerts.sectionTitle")}
          </div>
          <button onClick={onOpenAlertSheet} className="text-[11px] font-semibold text-primary">
            {t("common.edit")}
          </button>
        </div>
        {alerts.length === 0 ? (
          <button
            onClick={onOpenAlertSheet}
            className="w-full rounded-xl bg-accent px-3 py-4 text-center text-xs text-muted-foreground"
          >
            {t("alerts.desc")}
          </button>
        ) : (
          <div className="space-y-2">
            {alerts.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-xl bg-accent px-3 py-2">
                <div className="min-w-0 text-xs">
                  <div className="truncate font-semibold">{mallName(a.mall_id)}</div>
                  <div className="text-muted-foreground">{t("alerts.anyNewListing")}</div>
                </div>
                <button
                  aria-label={t("alerts.delete")}
                  onClick={async () => {
                    await deletePriceAlert(a.id);
                    await reload();
                  }}
                  className="ml-2 rounded-lg p-2 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
