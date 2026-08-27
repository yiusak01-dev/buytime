// District coverage for all of Hong Kong + price/tier helpers

export type District =
  | "sha_tin"
  | "tsuen_wan"
  | "west_kowloon"
  | "tsim_sha_tsui"
  | "causeway_bay"
  | "mong_kok"
  | "kowloon_bay"
  | "kwun_tong"
  | "tuen_mun"
  | "yuen_long"
  | "tung_chung"
  | "tseung_kwan_o"
  | "north_nt"
  | "kowloon_tong"
  | "ma_on_shan"
  | "sham_shui_po"
  | "north_point"
  | "chai_wan";

export const DISTRICT_LABELS: Record<District, string> = {
  sha_tin: "沙田",
  tsuen_wan: "荃灣",
  west_kowloon: "西九龍",
  tsim_sha_tsui: "尖沙咀",
  causeway_bay: "銅鑼灣",
  mong_kok: "旺角",
  kowloon_bay: "九龍灣",
  kwun_tong: "觀塘",
  tuen_mun: "屯門",
  yuen_long: "元朗",
  tung_chung: "東涌",
  tseung_kwan_o: "將軍澳",
  north_nt: "新界北",
  kowloon_tong: "九龍塘",
  ma_on_shan: "馬鞍山",
  sham_shui_po: "深水埗",
  north_point: "北角",
  chai_wan: "柴灣",
};

export const DISTRICT_LABELS_EN: Record<District, string> = {
  sha_tin: "Sha Tin",
  tsuen_wan: "Tsuen Wan",
  west_kowloon: "West Kowloon",
  tsim_sha_tsui: "Tsim Sha Tsui",
  causeway_bay: "Causeway Bay",
  mong_kok: "Mong Kok",
  kowloon_bay: "Kowloon Bay",
  kwun_tong: "Kwun Tong",
  tuen_mun: "Tuen Mun",
  yuen_long: "Yuen Long",
  tung_chung: "Tung Chung",
  tseung_kwan_o: "Tseung Kwan O",
  north_nt: "North NT",
  kowloon_tong: "Kowloon Tong",
  ma_on_shan: "Ma On Shan",
  sham_shui_po: "Sham Shui Po",
  north_point: "North Point",
  chai_wan: "Chai Wan",
};

export function districtLabelByLang(d: District, lang: string): string {
  if (lang === "en") return DISTRICT_LABELS_EN[d] ?? d;
  return DISTRICT_LABELS[d] ?? d;
}

export const DISTRICT_EMOJI: Record<District, string> = {
  sha_tin: "🌆",
  tsuen_wan: "🌿",
  west_kowloon: "🌉",
  tsim_sha_tsui: "⚓",
  causeway_bay: "🎡",
  mong_kok: "🏙️",
  kowloon_bay: "📦",
  kwun_tong: "🌙",
  tuen_mun: "🏙",
  yuen_long: "🌾",
  tung_chung: "✈️",
  tseung_kwan_o: "🍿",
  north_nt: "🏞️",
  kowloon_tong: "🏢",
  ma_on_shan: "⛰️",
  sham_shui_po: "🧵",
  north_point: "🚋",
  chai_wan: "🏭",
};

export const DISTRICTS: { id: District; label: string; emoji: string }[] = (
  Object.keys(DISTRICT_LABELS) as District[]
).map((id) => ({ id, label: DISTRICT_LABELS[id], emoji: DISTRICT_EMOJI[id] }));

export function districtLabel(d: District): string {
  return DISTRICT_LABELS[d] ?? d;
}

const MALL_DISTRICT_MAP: Array<[string, District]> = [
  ["新城市廣場", "sha_tin"], ["禾輋", "sha_tin"], ["HomeSquare", "sha_tin"], ["沙角", "sha_tin"],
  ["荃新天地", "tsuen_wan"], ["荃灣廣場", "tsuen_wan"], ["Citywalk", "tsuen_wan"],
  ["圓方", "west_kowloon"], ["奧海城", "west_kowloon"], ["天璽", "west_kowloon"], ["The ANGLE", "west_kowloon"],
  ["海港城", "tsim_sha_tsui"], ["i SQUARE", "tsim_sha_tsui"], ["K11", "tsim_sha_tsui"], ["The ONE", "tsim_sha_tsui"],
  ["時代廣場", "causeway_bay"], ["希慎廣場", "causeway_bay"], ["wwwtc", "causeway_bay"],
  ["朗豪坊", "mong_kok"], ["MOKO", "mong_kok"],
  ["MegaBox", "kowloon_bay"], ["德福廣場", "kowloon_bay"], ["Mikiki", "kowloon_bay"],
  ["apm", "kwun_tong"], ["寶達", "kwun_tong"], ["德田", "kwun_tong"],
  ["屯門市廣場", "tuen_mun"], ["V city", "tuen_mun"], ["V City", "tuen_mun"], ["新達廣場", "tuen_mun"], ["卓爾", "tuen_mun"], ["蝴蝶", "tuen_mun"], ["良景", "tuen_mun"],
  ["YOHO", "yuen_long"], ["朗屏", "yuen_long"], ["嘉湖", "yuen_long"],
  ["東薈城", "tung_chung"], ["富東", "tung_chung"], ["逸東", "tung_chung"],
  ["PopCorn", "tseung_kwan_o"], ["TKO", "tseung_kwan_o"], ["彩明", "tseung_kwan_o"],
  ["上水廣場", "north_nt"], ["大元", "north_nt"], ["太和", "north_nt"], ["太和廣場", "north_nt"], ["彩園", "north_nt"], ["天澤", "north_nt"], ["天盛", "north_nt"], ["天瑞", "north_nt"], ["天耀", "north_nt"], ["T Town", "north_nt"],
  ["又一城", "kowloon_tong"],
  ["頌安", "ma_on_shan"],
  ["元州", "sham_shui_po"],
  ["東港城", "north_point"], ["北角匯", "north_point"],
  ["興華", "chai_wan"], ["愛東", "chai_wan"], ["小西灣", "chai_wan"],
  ["太古城", "causeway_bay"],
  ["青衣城", "tsuen_wan"],
  ["彩雲", "kowloon_bay"], ["竹園", "kowloon_bay"], ["黃大仙", "kowloon_bay"], ["樂富", "kowloon_bay"],
  ["何文田", "tsim_sha_tsui"], ["愛民", "tsim_sha_tsui"], ["啟田", "tsim_sha_tsui"],
  ["南昌", "west_kowloon"], ["V Walk", "west_kowloon"],
  ["西沙GO PARK", "tseung_kwan_o"],
];

export function mallDistrict(mallName: string): District | null {
  for (const [keyword, district] of MALL_DISTRICT_MAP) {
    if (mallName.includes(keyword)) return district;
  }
  return null;
}

export const DISTRICT_COORDS: Record<District, { lat: number; lng: number }> = {
  sha_tin:         { lat: 22.3816, lng: 114.1876 },
  tsuen_wan:       { lat: 22.3726, lng: 114.1185 },
  west_kowloon:    { lat: 22.3083, lng: 114.1608 },
  tsim_sha_tsui:   { lat: 22.2983, lng: 114.1722 },
  causeway_bay:    { lat: 22.2798, lng: 114.1840 },
  mong_kok:        { lat: 22.3196, lng: 114.1694 },
  kowloon_bay:     { lat: 22.3238, lng: 114.2083 },
  kwun_tong:       { lat: 22.3119, lng: 114.2261 },
  tuen_mun:        { lat: 22.3935, lng: 113.9739 },
  yuen_long:       { lat: 22.4459, lng: 114.0347 },
  tung_chung:      { lat: 22.2881, lng: 113.9440 },
  tseung_kwan_o:   { lat: 22.3059, lng: 114.2591 },
  north_nt:        { lat: 22.4490, lng: 114.1620 },
  kowloon_tong:    { lat: 22.3370, lng: 114.1758 },
  ma_on_shan:      { lat: 22.4157, lng: 114.2319 },
  sham_shui_po:    { lat: 22.3286, lng: 114.1626 },
  north_point:     { lat: 22.2918, lng: 114.2000 },
  chai_wan:        { lat: 22.2668, lng: 114.2359 },
};

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function detectDistrictFromCoords(lat: number, lng: number): District | null {
  let best: District | null = null;
  let bestDist = Infinity;
  for (const [d, coords] of Object.entries(DISTRICT_COORDS) as [District, { lat: number; lng: number }][]) {
    const dist = haversineKm(lat, lng, coords.lat, coords.lng);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return bestDist < 20 ? best : null;
}

export function minPrice(hours: number): number {
  if (hours <= 1) return 5;
  if (hours === 2) return 12;
  if (hours === 3) return 18;
  return 25;
}
export function maxPrice(hourlyRate: number, hours: number): number {
  return Math.round(hourlyRate * hours);
}
export function validatePrice(price: number, hours: number, hourlyRate: number): { ok: boolean; msg?: string } {
  if (price < 0) return { ok: false, msg: "價錢不能為負數" };
  const lo = minPrice(hours);
  const hi = maxPrice(hourlyRate, hours);
  if (price < lo) return { ok: false, msg: `${hours} 小時泊車最低售價為 HK$${lo}` };
  if (price > hi) return { ok: false, msg: `最高售價為 HK$${hi}（商場時租 × 時數）` };
  return { ok: true };
}
export function suggestedPrice(hours: number, hourlyRate: number): number {
  const lo = minPrice(hours);
  const hi = maxPrice(hourlyRate, hours);
  return Math.round((lo + hi) / 2);
}

export const TIER_META = {
  new: { label: "新手", emoji: "🎟", color: "text-muted-foreground" },
  regular: { label: "會員", emoji: "⭐", color: "text-primary" },
  vip: { label: "VIP", emoji: "👑", color: "text-warning" },
} as const;
export type Tier = keyof typeof TIER_META;

export function tierFromLifetime(pts: number): Tier {
  if (pts >= 500) return "vip";
  if (pts >= 100) return "regular";
  return "new";
}

export const POINTS_PER_HKD = 100;
export const MAX_REDEEM_POINTS = 500;
export function pointsToHKD(pts: number): number {
  return Math.floor(pts / POINTS_PER_HKD);
}
export function hkdToPoints(hkd: number): number {
  return hkd * POINTS_PER_HKD;
}
