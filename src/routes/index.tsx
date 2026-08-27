import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { ownSupabase } from "@/integrations/supabase/own-client";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { ReceiptCard } from "@/components/ReceiptCard";
import { ReceiptDetailSheet } from "@/components/ReceiptDetailSheet";
import { NearbyBanner } from "@/components/LocationSelector";
import { PriceAlertSheet } from "@/components/PriceAlertSheet";
import { useReceipts } from "@/lib/queries";
import { useMockStore, useTier } from "@/lib/mock-store";
import { formatHKD } from "@/lib/fees";
import { mallDistrict, districtLabel, districtLabelByLang, TIER_META, type District } from "@/lib/districts";
import {
  fetchFavouriteMallIds,
  fetchMallGeo,
  type MallGeo,
} from "@/lib/user-prefs";

import type { ReceiptWithMall } from "@/lib/types";
import { Search, Sparkles, ArrowUpDown, Bell, Star } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const MallMap = lazy(() => import("@/components/MallMap"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "買時間 · 香港泊車收據交易平台" },
      { name: "description", content: "香港商場泊車收據二手交易，即買即用免費泊車。" },
      { property: "og:title", content: "買時間 · 香港泊車收據交易平台" },
      { property: "og:description", content: "香港商場泊車收據二手交易，即買即用免費泊車。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

type SortKey = "latest" | "price" | "savings";

function Home() {
  const { t, i18n } = useTranslation();
  const SORT_LABEL: Record<SortKey, string> = {
    latest: t("home.sortLatest"),
    price: t("home.sortPrice"),
    savings: t("home.sortSavings"),
  };
  const [selected, setSelected] = useState<ReceiptWithMall | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [district, setDistrict] = useState<District | null>(null);
  const [sort, setSort] = useState<SortKey>("latest");
  const [sortOpen, setSortOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "map">("list");
  const [mapMounted, setMapMounted] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [defaultAlertMall, setDefaultAlertMall] = useState<string | null>(null);
  const { data: allReceipts = [], isLoading } = useReceipts();
  const store = useMockStore();
  const tier = useTier();
  const tierMeta = TIER_META[tier];

  const [userId, setUserId] = useState<string | null>(null);
  const [favouriteIds, setFavouriteIds] = useState<number[]>([]);
  const [mallGeo, setMallGeo] = useState<MallGeo[]>([]);

  const [totalCompleted, setTotalCompleted] = useState<number | null>(null);
  const [recentTxns, setRecentTxns] = useState<any[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { count, error } = await ownSupabase
          .from("transactions")
          .select("id", { count: "exact", head: true })
          .eq("status", "completed");
        if (error) throw error;
        if (!cancelled) setTotalCompleted(count ?? 0);
      } catch (e) {
        console.error("[totalCompleted]", e);
      }
      try {
        const { data, error } = await ownSupabase
          .from("transactions")
          .select("id, mall_name, sale_price, receipt_amount, updated_at, created_at")
          .eq("status", "completed")
          .order("updated_at", { ascending: false })
          .limit(5);
        if (error) throw error;
        if (!cancelled) setRecentTxns(data ?? []);
      } catch (e) {
        console.error("[recentTxns]", e);
      }
      try {
        const geo = await fetchMallGeo();
        if (!cancelled) setMallGeo(geo);
      } catch (e) {
        console.error("[mallGeo]", e);
      }
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id ?? null;
      if (cancelled) return;
      setUserId(uid);
      if (uid) {
        setFavouriteIds(await fetchFavouriteMallIds(uid));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const receipts = useMemo(() => {
    let list = allReceipts.filter((r) => {
      if (district && mallDistrict(r.mall.name) !== district) return false;
      return true;
    });
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => {
        if (r.mall.name.toLowerCase().includes(q)) return true;
        if ((r.shop_name ?? "").toLowerCase().includes(q)) return true;
        const dist = mallDistrict(r.mall.name);
        if (dist) {
          const label = districtLabel(dist);
          if (label && label.toLowerCase().includes(q)) return true;
        }
        return false;
      });
    }
    const sorted = [...list];
    if (sort === "price") {
      sorted.sort((a, b) => a.listing_price - b.listing_price);
    } else if (sort === "savings") {
      sorted.sort(
        (a, b) => (b.amount - b.listing_price) - (a.amount - a.listing_price),
      );
    } else {
      sorted.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    }
    return sorted;
  }, [allReceipts, district, sort, search]);


  const nearby = useMemo(() => {
    if (!district) return [];
    return receipts.filter((r) => mallDistrict(r.mall.name) === district);
  }, [receipts, district]);

  const favSet = useMemo(() => new Set(favouriteIds.map(String)), [favouriteIds]);
  const favouriteReceipts = useMemo(
    () => (favSet.size === 0 ? [] : receipts.filter((r) => favSet.has(String(r.mall_id)))),
    [receipts, favSet],
  );
  const otherReceipts = useMemo(
    () => (favSet.size === 0 ? receipts : receipts.filter((r) => !favSet.has(String(r.mall_id)))),
    [receipts, favSet],
  );

  const waitlistCandidates = useMemo(() => {
    if (receipts.length > 0) return [];
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return mallGeo.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 3);
  }, [receipts.length, search, mallGeo]);

  const mapPoints = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of allReceipts) {
      counts.set(String(r.mall_id), (counts.get(String(r.mall_id)) ?? 0) + 1);
    }
    return mallGeo
      .filter((m) => m.lat != null && m.lng != null)
      .map((m) => ({
        id: m.id,
        name: m.name,
        lat: m.lat as number,
        lng: m.lng as number,
        count: counts.get(String(m.id)) ?? 0,
      }));
  }, [mallGeo, allReceipts]);

  const renderCards = (items: ReceiptWithMall[]) => (
    <div className="space-y-3">
      {items.map((r) => (
        <ReceiptCard key={r.id} receipt={r} onClick={() => { setSelected(r); setSheetOpen(true); }} />
      ))}
    </div>
  );

  return (
    <AppLayout>
      {/* Header */}
      <header className="px-4 pt-5 pb-4 gradient-primary text-white rounded-b-3xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-white/70">{t("home.hello", { name: store.user.name })}</div>
            <div className="text-xl font-bold mt-0.5 flex items-center gap-2">
              買時間
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-white/20`}>
                {tierMeta.emoji} {t(`tier.${tier}`)}
              </span>
            </div>
            <div className="text-[11px] text-white/80 mt-0.5">
              {totalCompleted === null
                ? t("home.dealsCompletedUnknown")
                : t("home.dealsCompleted", { count: totalCompleted })}
            </div>
          </div>
          <Link
            to="/profile"
            aria-label={t("nav.profile")}
            className="w-9 h-9 rounded-full bg-white/20 grid place-items-center text-base font-bold hover:bg-white/30 transition-colors"
          >
            {store.user.initial}
          </Link>
        </div>

        <NearbyBanner
          district={district}
          onChange={setDistrict}
          favouriteIds={favouriteIds}
          onFavouritesChange={setFavouriteIds}
        />
      </header>

      <>
        <div className="px-4 pt-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 bg-card rounded-xl px-3 py-2.5 shadow-[var(--shadow-card)]">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("home.searchPlaceholder")}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <button
              onClick={() => setAlertOpen(true)}
              aria-label={t("home.priceAlert")}
              className="h-[42px] w-[42px] grid place-items-center rounded-xl bg-card shadow-[var(--shadow-card)] text-primary"
            >
              <Bell className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setView((v) => {
                  const next = v === "list" ? "map" : "list";
                  if (next === "map") setMapMounted(true);
                  return next;
                });
              }}
              className="h-[42px] px-3 rounded-xl bg-card shadow-[var(--shadow-card)] text-xs font-semibold whitespace-nowrap"
            >
              {view === "list" ? t("home.viewMap") : t("home.viewList")}
            </button>
          </div>

          {mapMounted && (
            <section className={cn("space-y-2", (view !== "map" || alertOpen) && "hidden")}>
              {mapPoints.length === 0 ? (
                <div className="bg-card rounded-2xl py-12 text-center text-xs text-muted-foreground">
                  {t("map.noCoords")}
                </div>
              ) : (
                <ClientOnly
                  fallback={
                    <div className="h-[420px] w-full rounded-2xl bg-card animate-pulse grid place-items-center text-xs text-muted-foreground">
                      {t("map.loading")}
                    </div>
                  }
                >
                  <Suspense
                    fallback={
                      <div className="h-[420px] w-full rounded-2xl bg-card animate-pulse grid place-items-center text-xs text-muted-foreground">
                        {t("map.loading")}
                      </div>
                    }
                  >
                    <MallMap
                      points={mapPoints}
                      onSelectMall={(name) => {
                        setSearch(name);
                        setDistrict(null);
                        setView("list");
                      }}
                    />
                  </Suspense>
                </ClientOnly>
              )}
              <div className="text-[10px] text-muted-foreground text-center">{t("map.legend")}</div>
            </section>
          )}
          {view !== "map" && (
            <>
              <HowItWorks />

              {nearby.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="font-bold text-sm flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-warning" /> {t("home.nearbySection", { district: districtLabelByLang(district!, i18n.language) })}
                    </h2>
                    <span className="text-[10px] text-muted-foreground">{t("home.itemCount", { count: nearby.length })}</span>
                  </div>
                  {(() => {
                    const byMall = nearby.reduce<Record<string, typeof nearby>>((acc, r) => {
                      const key = r.mall.name;
                      if (!acc[key]) acc[key] = [];
                      acc[key].push(r);
                      return acc;
                    }, {});
                    return Object.entries(byMall).map(([mallName, items]) => (
                      <div key={mallName} className="mb-4">
                        <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                          🏢 {mallName}
                          <span className="ml-1 bg-primary/10 text-primary rounded-full px-1.5 py-0.5 text-[10px]">{items.length}個</span>
                        </div>
                        {renderCards(items)}
                      </div>
                    ));
                  })()}
                </section>
              )}

              <RecentDeals items={recentTxns} />

              {favouriteReceipts.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="font-bold text-sm flex items-center gap-1.5">
                      <Star className="w-4 h-4 fill-warning text-warning" /> {t("home.favouriteMalls")}
                    </h2>
                    <span className="text-[10px] text-muted-foreground">
                      {t("home.itemCount", { count: favouriteReceipts.length })}
                    </span>
                  </div>
                  {renderCards(favouriteReceipts)}
                </section>
              )}

              <section>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-bold text-sm">
                    {favouriteReceipts.length > 0 ? t("home.otherListings") : t("home.latestListings")}
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">{t("home.forSaleCount", { count: receipts.length })}</span>
                    <div className="relative">
                      <button
                        onClick={() => setSortOpen((v) => !v)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground px-2 py-1 rounded-lg hover:bg-accent"
                      >
                        <ArrowUpDown className="w-3 h-3" /> {SORT_LABEL[sort]}
                      </button>
                      {sortOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
                          <div className="absolute right-0 top-full mt-1 z-50 bg-card rounded-xl shadow-[var(--shadow-card)] border border-border overflow-hidden min-w-[110px]">
                            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                              <button
                                key={k}
                                onClick={() => { setSort(k); setSortOpen(false); }}
                                className={`block w-full text-left px-3 py-2 text-xs ${sort === k ? "text-primary font-semibold" : "text-foreground"}`}
                              >
                                {SORT_LABEL[k]}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-24 bg-card rounded-2xl animate-pulse" />
                    ))}
                  </div>
                ) : receipts.length === 0 ? (
                  <div className="bg-card rounded-2xl py-10 px-6 flex flex-col items-center text-center gap-2">
                    <div className="w-14 h-14 rounded-full bg-accent grid place-items-center text-2xl">📋</div>
                    <div className="text-sm font-semibold text-foreground">{t("home.emptyTitle")}</div>
                    <div className="text-xs text-muted-foreground">{t("home.emptyHint")}</div>

                    {waitlistCandidates.length > 0 && (
                      <div className="w-full space-y-2 pt-3">
                        {waitlistCandidates.map((m) => (
                          <div key={m.id} className="rounded-xl bg-accent px-3 py-2.5 text-left">
                            <div className="text-xs font-semibold truncate">
                              {t("home.noListingsForMall", { mall: m.name })}
                            </div>
                            <button
                              onClick={() => { setDefaultAlertMall(m.name); setAlertOpen(true); }}
                              className="mt-2 w-full rounded-lg bg-primary py-2 text-xs font-semibold text-primary-foreground"
                            >
                              {t("home.notifyMe")}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  renderCards(favouriteReceipts.length > 0 ? otherReceipts : receipts)
                )}
              </section>
            </>
          )}
        </div>
      </>

      <ReceiptDetailSheet receipt={selected} open={sheetOpen} onOpenChange={setSheetOpen} />
      <PriceAlertSheet
        open={alertOpen}
        defaultMall={defaultAlertMall}
        onOpenChange={(v) => { setAlertOpen(v); if (!v) setDefaultAlertMall(null); }}
      />
    </AppLayout>
  );
}

function timeAgo(iso?: string | null, t: (k: any, o?: any) => string = (k: string) => k) {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return t("time.justNow");
  if (mins < 60) return t("time.minsAgo", { mins });
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return t("time.hoursAgo", { hours: hrs });
  return t("time.daysAgo", { days: Math.round(hrs / 24) });
}

function RecentDeals({ items }: { items: any[] }) {
  const { t } = useTranslation();
  if (!items || items.length === 0) return null;
  return (
    <section>
      <h2 className="font-bold text-sm mb-2">{t("home.recentDeals")}</h2>
      <div className="overflow-x-auto flex gap-3 pb-1 -mx-4 px-4">
        {items.map((item) => {
          const saved = Math.max(0, Number(item.receipt_amount ?? 0) - Number(item.sale_price ?? 0));
          const label = item.mall_name
            ? saved > 0
              ? t("home.recentDealWithSavings", { mall: item.mall_name, saved: formatHKD(saved) })
              : t("home.recentDealNoSavings", { mall: item.mall_name })
            : t("home.recentDealGeneric");
          return (
            <div
              key={item.id}
              className="shrink-0 rounded-full bg-success/10 text-success text-[11px] font-semibold px-3 py-1.5 whitespace-nowrap"
            >
              {label}
              <span className="text-muted-foreground font-normal ml-1">
                {timeAgo(item.updated_at ?? item.created_at, t)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function HowItWorks() {
  const { t } = useTranslation();
  return (
    <section className="bg-gradient-to-br from-primary/8 to-primary/15 border border-primary/20 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold">{t("home.howTitle")}</div>
        <div className="text-[10px] bg-success/15 text-success px-2 py-0.5 rounded-full font-semibold">{t("home.howBadge")}</div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-white/50 dark:bg-white/5 rounded-xl p-2.5">
          <div className="text-xl">🛒</div>
          <div className="text-[11px] font-semibold mt-1">{t("home.howStep1Title")}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{t("home.howStep1Desc")}</div>
        </div>
        <div className="bg-white/50 dark:bg-white/5 rounded-xl p-2.5">
          <div className="text-xl">🔒</div>
          <div className="text-[11px] font-semibold mt-1">{t("home.howStep2Title")}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{t("home.howStep2Desc")}</div>
        </div>
        <div className="bg-white/50 dark:bg-white/5 rounded-xl p-2.5">
          <div className="text-xl">🤝</div>
          <div className="text-[11px] font-semibold mt-1">{t("home.howStep3Title")}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{t("home.howStep3Desc")}</div>
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground text-center">{t("home.howDisclaimer")}</div>
    </section>
  );
}
