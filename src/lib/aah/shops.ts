import { useQuery } from "@tanstack/react-query";
import { ownSupabase } from "@/integrations/supabase/own-client";
import { useAahMode } from "./store";
import type { MallShop } from "./receipt";
import type { AahMall } from "./types";

/**
 * 示範商場嘅示範舖頭（只係示範模式用，未核實）。
 * 正式版讀資料庫 mall_shops：由每週商場資料定時任務抓返嚟，冇名單嘅商場唔會提醒。
 */
const DEMO_SHOPS: Record<string, MallShop[]> = {
  "s-apm": [
    { name: "鼎泰豐", nameEn: "Din Tai Fung", category: "dining" },
    { name: "一蘭", nameEn: "Ichiran", category: "dining" },
    { name: "譚仔三哥", nameEn: "TamJai SamGor", category: "dining" },
    { name: "大家樂", nameEn: "Cafe de Coral", category: "dining" },
    { name: "屈臣氏", nameEn: "Watsons", category: "retail" },
    { name: "UNIQLO", nameEn: "UNIQLO", category: "retail" },
    { name: "百佳", nameEn: "PARKnSHOP", category: "retail" },
  ],
};

/** 呢個商場嘅舖頭名單；冇名單（或者讀唔到）就係空，即係唔判斷 */
export function useMallShops(mall: AahMall | null | undefined): MallShop[] {
  const mode = useAahMode();
  const remoteReady = mode === "remote" && !!mall && mall.source === "db" && (mall.shopsCount ?? 0) > 0;
  const q = useQuery<MallShop[]>({
    queryKey: ["aah", "shops", mall?.id],
    enabled: remoteReady,
    staleTime: 60 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await ownSupabase
        .from("mall_shops" as never)
        .select("name,name_en,category")
        .eq("mall_id", Number(mall!.id))
        .limit(3000);
      if (error) throw error;
      return ((data ?? []) as { name: string; name_en: string | null; category: string | null }[]).map((r) => ({
        name: r.name,
        nameEn: r.name_en,
        category: r.category,
      }));
    },
  });
  if (mode !== "remote") return (mall && DEMO_SHOPS[mall.id]) || [];
  return remoteReady ? (q.data ?? []) : [];
}
