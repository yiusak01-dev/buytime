// Adapters between the app's `Mall` / `ReceiptWithMall` types and rows from
// the user's Supabase views (`v_active_listings`, `v_malls_active_rules`).
import type { Mall, ReceiptWithMall, SellerInfo } from "./types";
import { deriveMallRule } from "./parking-rules";

export function emojiForMall(name: string): string {
  if (!name) return "🏬";
  if (name.includes("海港城")) return "⛵";
  if (name.includes("圓方") || name.toLowerCase().includes("elements")) return "✨";
  if (name.includes("時代廣場")) return "🎡";
  if (name.includes("新城市")) return "🏙️";
  if (name.includes("荃新") || name.includes("荃灣")) return "🌆";
  if (name.includes("apm")) return "🌃";
  if (name.includes("MegaBox") || name.includes("九龍灣")) return "📦";
  if (name.includes("IFC") || name.includes("國際金融")) return "🏦";
  return "🏬";
}

export function mapMallRow(row: any): Mall {
  const category = String(row.mall_category ?? "A");
  const condText = String(row.cond_wd ?? row.weekday_parking_cond ?? row.notes ?? "");
  const derived = deriveMallRule(condText);

  let spendingTiers: Array<{ min_spend: number; hours: number }> = [];
  const tiers = row.spending_tiers;
  if (Array.isArray(tiers)) {
    spendingTiers = tiers
      .filter((t: any) => t != null)
      .map((t: any) => ({
        min_spend: Number(t.min_spend ?? t.minSpend ?? 0),
        hours: Number(t.hours ?? t.free_hours ?? 0),
      }))
      .filter((t) => t.hours > 0);
  }

  if (category === "C" && spendingTiers.length === 0) {
    const tierMatch = condText.match(/\$?\s*(\d+)\s*=\s*(\d+)\s*hr/i);
    if (tierMatch) {
      spendingTiers = [{ min_spend: Number(tierMatch[1]), hours: Number(tierMatch[2]) }];
    }
  }

  const maxParkingHours =
    row.max_parking_hours != null ? Number(row.max_parking_hours) : derived.maxParkingHours;
  const minSpendPerHour =
    row.min_spend_per_hour != null ? Number(row.min_spend_per_hour) : derived.minSpendPerHour;
  const hourlyRate = Number(row.hourly_rate ?? row.hourly_rate_weekday ?? 22);

  return {
    id: String(row.id ?? row.mall_id ?? ""),
    name: row.name ?? row.mall_name ?? "",
    icon_emoji: row.icon_emoji ?? emojiForMall(row.name ?? row.mall_name ?? ""),
    hourly_rate_weekday: Number(row.hourly_rate_weekday ?? row.hourly_rate ?? 20),
    hourly_rate_weekend: Number(row.hourly_rate_weekend ?? row.hourly_rate ?? 20),
    spending_tiers: spendingTiers,
    promotion_start_time: row.promotion_start_time ?? null,
    promotion_end_time: row.promotion_end_time ?? null,
    counter_floor: row.counter_floor ?? null,
    counter_location: row.counter_location ?? null,
    counter_hours: row.counter_hours ?? null,
    validation_method: row.validation_method ?? "counter",
    notes: row.notes ?? null,
    last_verified_at: row.last_verified_at ?? new Date().toISOString(),
    entry_time_start: row.entry_time_start ?? null,
    entry_time_end: row.entry_time_end ?? null,
    min_spend_per_hour: minSpendPerHour,
    hourly_rate: hourlyRate,
    district: row.district ?? null,
    mall_category: category,
    lat: row.lat != null ? Number(row.lat) : null,
    lng: row.lng != null ? Number(row.lng) : null,
    max_parking_hours: maxParkingHours,
  };
}

export function mapListingRow(row: any, mallsById: Map<string, Mall>): ReceiptWithMall {
  const mallId = String(row.mall_id ?? "");
  const mall: Mall =
    mallsById.get(mallId) ??
    mapMallRow({ mall_id: mallId, mall_name: row.mall_name ?? "" });

  const seller: SellerInfo = {
    name: row.seller_name ?? "賣家",
    initial: (row.seller_initial as string) ?? (row.seller_name?.[0] ?? "U").toUpperCase(),
    rating: Number(row.seller_rating ?? 5),
    deals: Number(row.seller_deals ?? 0),
  };

  const parkingHours = Number(row.parking_hours ?? row.free_hours ?? 2);
  const askingPrice = Number(row.asking_price ?? row.listing_price ?? 0);

  return {
    id: String(row.id ?? row.listing_id ?? ""),
    mall_id: mallId,
    seller_id: row.seller_id ?? null,
    shop_name: row.merchant_name ?? row.shop_name ?? "—",
    amount: Number(row.receipt_amount ?? row.spend_amount ?? row.amount ?? 0),
    free_hours: parkingHours,
    listing_price: askingPrice,
    serial_number: row.serial_number ?? row.receipt_serial ?? "",
    expiry_time: row.expires_at ?? row.expiry_time ?? new Date(Date.now() + 2 * 3600_000).toISOString(),
    status: row.status ?? "active",
    created_at: row.created_at ?? new Date().toISOString(),
    photo_url: row.receipt_photo_url ?? row.photo_url ?? null,
    payment_method: row.payment_method ?? null,
    mall,
    seller,
  };
}
