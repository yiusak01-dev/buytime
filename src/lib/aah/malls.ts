import { useQuery } from "@tanstack/react-query";
import { ownSupabase } from "@/integrations/supabase/own-client";
import type { AahMall } from "./types";

/**
 * 內置示範商場。正式用時會優先讀資料庫 malls 表（有 lat/lng 嘅先用），
 * 呢度只係資料庫讀唔到時嘅後備。泊車條件同時租係示範數字，未核實。
 */
export const SAMPLE_MALLS: AahMall[] = [
  { id: "s-apm", name: "APM", district: "觀塘", lat: 22.3121, lng: 114.2252, radius: 180, condWeekday: "$300=2hr | $500=3hr", condWeekend: "$500=2hr | $800=3hr", rateWeekday: 24, rateWeekend: 28, source: "sample" },
  { id: "s-langham", name: "朗豪坊", district: "旺角", lat: 22.3184, lng: 114.1686, radius: 160, condWeekday: "$300=2hr | $600=3hr", condWeekend: "$500=2hr | $800=3hr", rateWeekday: 30, rateWeekend: 35, source: "sample" },
  { id: "s-timessq", name: "時代廣場", district: "銅鑼灣", lat: 22.2783, lng: 114.1822, radius: 150, condWeekday: "$400=2hr | $800=3hr", condWeekend: "$600=2hr | $1000=3hr", rateWeekday: 35, rateWeekend: 40, source: "sample" },
  { id: "s-hysan", name: "希慎廣場", district: "銅鑼灣", lat: 22.2797, lng: 114.1839, radius: 120, condWeekday: "$400=2hr", condWeekend: "$600=2hr", rateWeekday: 35, rateWeekend: 40, source: "sample" },
  { id: "s-leegarden", name: "利園", district: "銅鑼灣", lat: 22.2779, lng: 114.1849, radius: 120, condWeekday: "$500=2hr", condWeekend: "$800=2hr", rateWeekday: 38, rateWeekend: 42, source: "sample" },
  { id: "s-ntp", name: "新城市廣場", district: "沙田", lat: 22.3817, lng: 114.1889, radius: 220, condWeekday: "$200=1hr | $400=2hr | $600=3hr", condWeekend: "$300=1hr | $600=2hr | $900=3hr", rateWeekday: 22, rateWeekend: 26, source: "sample" },
  { id: "s-harbourcity", name: "海港城", district: "尖沙咀", lat: 22.2976, lng: 114.1683, radius: 280, condWeekday: "每$300=1hr（最多3hr）", condWeekend: "每$500=1hr（最多3hr）", rateWeekday: 32, rateWeekend: 38, source: "sample" },
];

const EXCLUDED = ["東薈城 南面P1"];

export function useAahMalls() {
  const q = useQuery<AahMall[]>({
    queryKey: ["aah", "malls"],
    staleTime: 60 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await ownSupabase
        .from("malls")
        .select("id,name,district,lat,lng,weekday_parking_cond,holiday_parking_cond,hourly_rate_weekday_num,hourly_rate_holiday_num,hourly_rate_weekend,supports_stacking,is_active");
      if (error) throw error;
      const rows: AahMall[] = (data ?? [])
        .filter((r: any) => r.is_active !== false && r.lat != null && r.lng != null)
        .filter((r: any) => !EXCLUDED.some((n) => String(r.name ?? "").includes(n)))
        .map((r: any) => ({
          id: String(r.id),
          name: String(r.name ?? ""),
          district: String(r.district ?? ""),
          lat: Number(r.lat),
          lng: Number(r.lng),
          radius: 200,
          // 「holiday」= 星期六日及公眾假期
          condWeekday: r.weekday_parking_cond ?? null,
          condWeekend: r.holiday_parking_cond ?? r.weekday_parking_cond ?? null,
          rateWeekday: r.hourly_rate_weekday_num != null ? Number(r.hourly_rate_weekday_num) : null,
          rateWeekend: r.hourly_rate_holiday_num != null ? Number(r.hourly_rate_holiday_num) : r.hourly_rate_weekend != null ? Number(r.hourly_rate_weekend) : null,
          stacking: r.supports_stacking ?? null,
          source: "db" as const,
        }));
      return rows;
    },
  });
  const malls = q.data && q.data.length > 0 ? q.data : SAMPLE_MALLS;
  return { malls, isSample: !(q.data && q.data.length > 0), isLoading: q.isLoading };
}

export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 搵出而家身處嘅商場（喺範圍之內最近嗰個） */
export function findMallAt(malls: AahMall[], lat: number, lng: number): AahMall | null {
  let best: { m: AahMall; d: number } | null = null;
  for (const m of malls) {
    const d = distanceM(lat, lng, m.lat, m.lng);
    if (d <= m.radius && (!best || d < best.d)) best = { m, d };
  }
  return best?.m ?? null;
}

/** 行路幾分鐘到嘅附近商場（$5 置頂會推送埋呢啲） */
export function nearbyMalls(malls: AahMall[], mall: AahMall, maxM = 700): AahMall[] {
  return malls
    .filter((m) => m.id !== mall.id && distanceM(mall.lat, mall.lng, m.lat, m.lng) <= maxM)
    .sort((a, b) => distanceM(mall.lat, mall.lng, a.lat, a.lng) - distanceM(mall.lat, mall.lng, b.lat, b.lng));
}

/**
 * 示範用：估計商場入面而家有幾多用戶。
 * 正式版會用真實數字（有訂閱、喺商場範圍入面嘅用戶），唔可以虛報。
 */
export function demoAudience(mallId: string) {
  let h = 0;
  for (const c of mallId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 20 + (h % 40);
}

export function nearestMalls(malls: AahMall[], lat: number, lng: number, n = 5): (AahMall & { distance: number })[] {
  return malls
    .map((m) => ({ ...m, distance: distanceM(lat, lng, m.lat, m.lng) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, n);
}
