import { useEffect, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { MapPin, ChevronDown, Loader2, Check, Navigation, Star, RefreshCw } from "lucide-react";
import { DISTRICTS, detectDistrictFromCoords, districtLabel, districtLabelByLang, haversineKm, mallDistrict, type District } from "@/lib/districts";
import { ownSupabase } from "@/integrations/supabase/own-client";
import { supabase } from "@/integrations/supabase/client";
import { fetchFavouriteMallIds, toggleFavouriteMall } from "@/lib/user-prefs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface Props {
  district: District | null;
  onChange: (d: District | null) => void;
  favouriteIds?: number[];
  onFavouritesChange?: (ids: number[]) => void;
}

type GpsState = "idle" | "detecting" | "ok" | "denied" | "unavailable";
type NearMall = { id: number; name: string; distKm: number };

function formatDist(distKm: number) {
  return distKm < 1 ? `${Math.round(distKm * 1000)}m` : `${distKm.toFixed(1)}km`;
}

export function NearbyBanner({ district, onChange, favouriteIds, onFavouritesChange }: Props) {
  const { t, i18n } = useTranslation();
  const [gpsState, setGpsState] = useState<GpsState>("detecting");
  const [open, setOpen] = useState(false);
  const [nearMalls, setNearMalls] = useState<NearMall[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [localFavs, setLocalFavs] = useState<number[]>([]);
  const [favMalls, setFavMalls] = useState<Array<{ id: number; name: string }>>([]);
  const [allMalls, setAllMalls] = useState<Array<{ id: number; name: string }>>([]);


  const favs = favouriteIds ?? localFavs;

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid && !favouriteIds) setLocalFavs(await fetchFavouriteMallIds(uid));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // All malls for the picker sheet (star toggles)
  useEffect(() => {
    (async () => {
      const { data } = await ownSupabase.from("malls").select("id, name").order("name");
      setAllMalls((data ?? []).map((m: any) => ({ id: Number(m.id), name: m.name as string })));
    })();
  }, []);

  // Resolve favourite mall names for the picker sheet
  useEffect(() => {
    if (favs.length === 0) { setFavMalls([]); return; }
    (async () => {
      const { data } = await ownSupabase.from("malls").select("id, name").in("id", favs);
      setFavMalls((data ?? []).map((m: any) => ({ id: Number(m.id), name: m.name as string })));
    })();
  }, [favs.join(",")]);



  async function handleToggleFav(mallId: number) {
    if (!userId) return;
    const isFav = favs.includes(mallId);
    try {
      await toggleFavouriteMall(userId, mallId, isFav);
      const next = isFav ? favs.filter((id) => id !== mallId) : [...favs, mallId];
      if (onFavouritesChange) onFavouritesChange(next);
      else setLocalFavs(next);
      toast.success(isFav ? t("favourites.removed") : t("favourites.added"));
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    }
  }

  async function runGps() {
    // Check if running in Capacitor native app
    const isNative = typeof (window as any).Capacitor !== "undefined" &&
      (window as any).Capacitor.isNativePlatform?.();

    if (isNative) {
      // Use Capacitor Geolocation plugin (requires @capacitor/geolocation in APK)
      try {
        setGpsState("detecting");
        const CapGeo = (window as any).Capacitor.Plugins.Geolocation;
        // Request permission first
        await CapGeo.requestPermissions({ permissions: ["location"] }).catch(() => {});
        const pos = await CapGeo.getCurrentPosition({ timeout: 10000, enableHighAccuracy: true });
        const { latitude, longitude } = pos.coords;
        const d = detectDistrictFromCoords(latitude, longitude);
        setGpsState("ok");
        if (d && district === null) onChange(d);
        try {
          const { data } = await ownSupabase
            .from("malls")
            .select("id, name, lat, lng")
            .not("lat", "is", null);
          const list = (data ?? [])
            .filter((m: any) => m.lat != null && m.lng != null)
            .map((m: any) => ({
              id: Number(m.id),
              name: m.name as string,
              distKm: haversineKm(latitude, longitude, Number(m.lat), Number(m.lng)),
            }))
            .sort((a: NearMall, b: NearMall) => a.distKm - b.distKm)
            .slice(0, 3);
          setNearMalls(list);
        } catch (e) {
          console.error("[nearMalls]", e);
        }
      } catch (e) {
        console.error("[runGps native]", e);
        setGpsState("denied");
      }
    } else {
      // Browser fallback
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        setGpsState("unavailable");
        return;
      }
      setGpsState("detecting");
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          const d = detectDistrictFromCoords(latitude, longitude);
          setGpsState("ok");
          if (d && district === null) onChange(d);
          try {
            const { data } = await ownSupabase
              .from("malls")
              .select("id, name, lat, lng")
              .not("lat", "is", null);
            const list = (data ?? [])
              .filter((m: any) => m.lat != null && m.lng != null)
              .map((m: any) => ({
                id: Number(m.id),
                name: m.name as string,
                distKm: haversineKm(latitude, longitude, Number(m.lat), Number(m.lng)),
              }))
              .sort((a: NearMall, b: NearMall) => a.distKm - b.distKm)
              .slice(0, 3);
            setNearMalls(list);
          } catch (e) {
            console.error("[nearMalls]", e);
          }
        },
        () => setGpsState("denied"),
        { timeout: 8000, maximumAge: 60000 }
      );
    }
  }

  useEffect(() => {
    runGps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label = district
    ? t("location.districtArea", { label: districtLabelByLang(district, i18n.language) })
    : gpsState === "detecting"
    ? t("location.detecting")
    : gpsState === "denied"
    ? t("location.denied")
    : t("location.selectArea");

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 bg-white/15 backdrop-blur-sm text-white rounded-xl px-3 py-2.5 text-left"
      >
        {gpsState === "detecting" ? (
          <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
        ) : (
          <MapPin className="w-4 h-4 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-white/70">{t("location.question")}</div>
          <div className="text-sm font-semibold truncate">{label}</div>
        </div>
        {gpsState === "denied" ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); runGps(); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); runGps(); } }}
            aria-label="Retry location"
            className="p-1.5 rounded-full hover:bg-white/20 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </span>
        ) : (
          <ChevronDown className="w-4 h-4 opacity-80" />
        )}
      </button>

      {nearMalls.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5">
          {nearMalls.map((m) => {
            const d = mallDistrict(m.name);
            const isFav = favs.includes(m.id);
            return (
              <div
                key={m.id}
                className="shrink-0 flex items-center gap-1 rounded-full bg-white/20 text-white text-[11px] font-semibold pl-3 pr-1.5 py-1 whitespace-nowrap"
              >
                <button
                  onClick={() => d && onChange(d)}
                  className="flex items-center gap-1 hover:opacity-80"
                >
                  <Navigation className="w-3 h-3" />
                  {m.name}
                  <span className="font-normal text-white/75">· {formatDist(m.distKm)}</span>
                </button>
                {userId && (
                  <button
                    onClick={() => handleToggleFav(m.id)}
                    aria-label={isFav ? t("favourites.remove") : t("favourites.add")}
                    className="p-1 rounded-full hover:bg-white/20"
                  >
                    <Star className={cn("w-3.5 h-3.5", isFav ? "fill-warning text-warning" : "text-white/80")} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}


      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="p-0 rounded-t-3xl border-0 max-h-[70dvh] overflow-y-auto">
          <div className="mx-auto w-full max-w-lg px-5 pt-6 pb-8">
            <div className="w-10 h-1 bg-border rounded-full mx-auto -mt-2 mb-4" />
            <h2 className="text-lg font-bold mb-1">{t("location.sheetTitle")}</h2>
            <p className="text-xs text-muted-foreground mb-4">{t("location.sheetHint")}</p>

            {favMalls.length > 0 && (
              <div className="mb-4">
                <div className="text-xs font-bold mb-2">⭐ {t("favourites.sectionTitle")}</div>
                <div className="space-y-2">
                  {favMalls.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 rounded-xl border border-border bg-card p-3">
                      <button
                        onClick={() => {
                          const d = mallDistrict(m.name);
                          if (d) onChange(d);
                          setOpen(false);
                        }}
                        className="flex-1 text-left text-sm font-semibold truncate"
                      >
                        {m.name}
                      </button>
                      <button
                        onClick={() => handleToggleFav(m.id)}
                        aria-label={t("favourites.remove")}
                        className="p-1.5 rounded-lg hover:bg-accent"
                      >
                        <Star className="w-4 h-4 fill-warning text-warning" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => { onChange(null); setOpen(false); }}
              className={cn(
                "w-full flex items-center gap-3 rounded-xl border p-3 mb-2 text-left",
                district === null ? "border-primary bg-primary/5" : "border-border bg-card"
              )}
            >
              <div className="w-10 h-10 rounded-lg bg-accent grid place-items-center text-lg">🌏</div>
              <div className="flex-1">
                <div className="font-semibold text-sm">{t("location.allHK")}</div>
                <div className="text-xs text-muted-foreground">{t("location.allHKDesc")}</div>
              </div>
              {district === null && <Check className="w-4 h-4 text-primary" />}
            </button>

            <div className="space-y-2">
              {DISTRICTS.map((d) => (
                <button
                  key={d.id}
                  onClick={() => { onChange(d.id); setOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-xl border p-3 text-left",
                    district === d.id ? "border-primary bg-primary/5" : "border-border bg-card"
                  )}
                >
                  <div className="w-10 h-10 rounded-lg bg-accent grid place-items-center text-lg">{d.emoji}</div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{t("location.districtArea", { label: districtLabelByLang(d.id, i18n.language) })}</div>
                  </div>
                  {district === d.id && <Check className="w-4 h-4 text-primary" />}
                </button>
              ))}
            </div>

            {allMalls.length > 0 && (
              <div className="mt-5">
                <div className="text-xs font-bold mb-2">🏬 {t("favourites.allMalls")}</div>
                <div className="space-y-1.5">
                  {allMalls.map((m) => {
                    const isFav = favs.includes(m.id);
                    return (
                      <div key={m.id} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
                        <button
                          onClick={() => {
                            const d = mallDistrict(m.name);
                            if (d) onChange(d);
                            setOpen(false);
                          }}
                          className="flex-1 min-w-0 text-left text-sm font-medium truncate"
                        >
                          {m.name}
                        </button>
                        {userId && (
                          <button
                            onClick={() => handleToggleFav(m.id)}
                            aria-label={isFav ? t("favourites.remove") : t("favourites.add")}
                            className="p-1.5 rounded-lg hover:bg-accent"
                          >
                            <Star className={cn("w-4 h-4", isFav ? "fill-warning text-warning" : "text-muted-foreground")} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
