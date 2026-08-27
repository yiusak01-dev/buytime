import { useQuery } from "@tanstack/react-query";
import { ownSupabase } from "@/integrations/supabase/own-client";
import { mapListingRow, mapMallRow } from "./own-mappers";
import type { Mall, ReceiptWithMall } from "./types";

export type MallRule = {
  mall_id: string;
  mall_name: string;
  district: string | null;
  region: string | null;
  cond_wd: string | null;
  cond_we: string | null;
  rate_wd_num: number | null;
  rate_we_num: number | null;
};

// 冇泊車優惠，唔應該出現喺放單下拉選單
const EXCLUDED_MALL_NAMES = ["東薈城 南面P1"];
function isExcludedMall(name: string | null | undefined) {
  return EXCLUDED_MALL_NAMES.some((n) => (name ?? "").includes(n));
}

export function useMallRules() {
  return useQuery<MallRule[]>({
    queryKey: ["own", "mall_rules"],
    queryFn: async () => {
      const { data, error } = await ownSupabase
        .from("malls")
        .select("id,name,district,region,cond_wd,cond_we,rate_wd_num,rate_we_num")
        .order("name");
      if (error) throw error;
      return (data ?? []).filter((r: any) => !isExcludedMall(r.name)).map((r: any) => ({
        mall_id: String(r.id),
        mall_name: r.name ?? "",
        district: r.district ?? null,
        region: r.region ?? null,
        cond_wd: r.cond_wd ?? null,
        cond_we: r.cond_we ?? null,
        rate_wd_num: r.rate_wd_num != null ? Number(r.rate_wd_num) : null,
        rate_we_num: r.rate_we_num != null ? Number(r.rate_we_num) : null,
      }));
    },
  });
}

export function useMalls() {
  return useQuery<Mall[]>({
    queryKey: ["own", "malls"],
    queryFn: async () => {
      const { data, error } = await ownSupabase
        .from("malls")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []).filter((r: any) => !isExcludedMall(r.name)).map(mapMallRow);
    },
  });
}

export function useReceipts() {
  return useQuery<ReceiptWithMall[]>({
    queryKey: ["own", "active_listings"],
    queryFn: async () => {
      const [listingsRes, mallsRes] = await Promise.all([
        ownSupabase.from("v_public_listings").select("*").order("created_at", { ascending: false }),
        ownSupabase.from("malls").select("*"),
      ]);
      if (listingsRes.error) throw listingsRes.error;
      if (mallsRes.error) throw mallsRes.error;

      const mallsById = new Map<string, Mall>();
      for (const row of mallsRes.data ?? []) {
        const m = mapMallRow(row);
        mallsById.set(m.id, m);
      }

      const listings = listingsRes.data ?? [];
      return listings.map((row: any) => mapListingRow(row, mallsById));
    },
  });
}
