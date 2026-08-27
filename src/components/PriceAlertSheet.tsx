import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Bell, Search, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchMallGeo,
  fetchPriceAlerts,
  savePriceAlert,
  deletePriceAlert,
  type MallGeo,
  type PriceAlertRow,
} from "@/lib/user-prefs";
import { cn } from "@/lib/utils";

export function PriceAlertSheet({
  open,
  onOpenChange,
  defaultMall,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultMall?: string | null;
}) {
  const { t } = useTranslation();
  const [userId, setUserId] = useState<string | null>(null);
  const [malls, setMalls] = useState<MallGeo[]>([]);
  const [alerts, setAlerts] = useState<PriceAlertRow[]>([]);
  const [query, setQuery] = useState("");
  const [mallId, setMallId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setUserId(uid);
      setMalls(await fetchMallGeo());
      if (uid) setAlerts(await fetchPriceAlerts(uid));
    })();
  }, [open]);

  useEffect(() => {
    if (!open || !defaultMall) return;
    setQuery(defaultMall);
    const found = malls.find((m) => m.name === defaultMall);
    if (found) setMallId(found.id);
  }, [open, defaultMall, malls]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? malls.filter((m) => m.name.toLowerCase().includes(q)) : malls;
    return list.slice(0, 20);
  }, [malls, query]);

  const mallName = (id: number) => malls.find((m) => m.id === id)?.name ?? `#${id}`;

  async function handleSave() {
    if (!userId || !mallId) return;
    setSaving(true);
    try {
      await savePriceAlert(userId, mallId, 9999);
      setAlerts(await fetchPriceAlerts(userId));
      setMallId(null);
      setQuery("");
      toast.success(t("alerts.saved"));
    } catch (e: any) {
      toast.error(e?.message ?? t("alerts.saveFailed"));
    }
    setSaving(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-3xl border-0 p-0">
        <div className="mx-auto w-full max-w-lg px-5 pb-8 pt-6">
          <div className="mx-auto -mt-2 mb-4 h-1 w-10 rounded-full bg-border" />
          <h2 className="mb-1 flex items-center gap-2 text-lg font-bold">
            <Bell className="h-4 w-4 text-primary" /> {t("alerts.title")}
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">{t("alerts.desc")}</p>

          {!userId ? (
            <div className="rounded-xl bg-accent p-4 text-center text-xs text-muted-foreground">
              {t("alerts.signInRequired")}
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-2 rounded-xl bg-accent px-3 py-2.5">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("alerts.searchMall")}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>

              <div className="mb-3 max-h-44 space-y-1.5 overflow-y-auto">
                {filtered.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMallId(m.id)}
                    className={cn(
                      "w-full rounded-xl border px-3 py-2 text-left text-sm",
                      mallId === m.id ? "border-primary bg-primary/5 font-semibold" : "border-border bg-card",
                    )}
                  >
                    {m.emoji ?? "🏬"} {m.name}
                  </button>
                ))}
              </div>

              <button
                disabled={saving || !mallId}
                onClick={handleSave}
                className="mt-4 h-12 w-full rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {saving ? t("common.loading") : t("alerts.save")}
              </button>

              {alerts.length > 0 && (
                <div className="mt-5">
                  <div className="mb-2 text-sm font-bold">{t("alerts.activeTitle")}</div>
                  <div className="space-y-2">
                    {alerts.map((a) => (
                      <div key={a.id} className="flex items-center justify-between rounded-xl bg-accent px-3 py-2">
                        <div className="min-w-0 text-xs">
                          <div className="truncate font-semibold">{mallName(a.mall_id)}</div>
                          <div className="text-muted-foreground">
                            {a.max_price >= 9999 ? t("alerts.anyNewListing") : t("alerts.underPrice", { price: a.max_price })}
                          </div>
                        </div>
                        <button
                          aria-label={t("alerts.delete")}
                          onClick={async () => {
                            await deletePriceAlert(a.id);
                            if (userId) setAlerts(await fetchPriceAlerts(userId));
                          }}
                          className="rounded-lg p-2 text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
