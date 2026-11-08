import { redeemPlaceText } from "@/lib/aah/malls";
import type { AahMall } from "@/lib/aah/types";

/**
 * 泊車優惠單據點樣交收：一齊去換，張單同信用卡底單唔使交俾陌生人。
 * 換泊車地點只會用商場官網寫明、記低咗出處嘅資料；冇就唔寫樓層。
 */
export function ParkingHandover({ mall, compact = false }: { mall?: AahMall | null; compact?: boolean }) {
  const place = redeemPlaceText(mall);
  return (
    <div
      className="rounded-2xl px-4 py-3 space-y-1.5 border"
      style={{ background: "#E5EEFC", borderColor: "#C9D9F7", color: "#1F3F86" }}
      data-testid="parking-handover"
    >
      <div className="text-sm font-black">一齊去換泊車，張單唔使交俾對方</div>
      <ul className="text-[13px] leading-relaxed space-y-0.5">
        <li>📍 喺{place}見面</li>
        <li>🧾 單據同信用卡底單由放嘅人自己交俾職員，換完攞返</li>
        {!compact && <li>🚗 要嘅人俾自己張泊車飛（或者講車牌）換，換到先俾錢</li>}
      </ul>
    </div>
  );
}
