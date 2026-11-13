import type { AahMall, Direction, Post, ScenarioId } from "./types";

/**
 * 啱啱好規則（數字喺管理頁「設定」改，唔寫死喺 code）：
 * - 唔支持炒飛：泊車優惠單據有參考價（商場停車場時租 × 比例 × 換到幾多個鐘）；超過參考價會提醒，超過幾多倍唔俾放
 *   餐廳排隊飛冇參考價：多謝費自己定，免費都得
 * - 每日上限：餐廳排隊飛、同一間分店、泊車優惠單據；香港時間每日 0 點重新計，取消咗都計
 * 伺服器（aah_create_post、aah__guard_price）會再檢查一次，呢度只係提早話俾用戶知。
 */
export type Rules = {
  pinEnabled: boolean;
  smsLogin: boolean;
  /** 泊車參考價 = 商場時租 × 呢個比例 × 鐘數（0.5 = 時租一半） */
  parkingRefRateFactor: number;
  priceBlockMultiple: number;
  limitDiningPerDay: number;
  limitDiningBranchPerDay: number;
  limitParkingPerDay: number;
};

export const DEFAULT_RULES: Rules = {
  pinEnabled: false,
  smsLogin: false,
  parkingRefRateFactor: 0.5,
  priceBlockMultiple: 2,
  limitDiningPerDay: 3,
  limitDiningBranchPerDay: 1,
  limitParkingPerDay: 3,
};

/** 由 aah_settings 讀出嚟嘅值轉做規則；讀唔到就用預設 */
export function rulesFromSettings(map: Map<string, unknown>): Rules {
  const num = (k: string): number | null => {
    const v = map.get(k);
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
    if (typeof v === "string" && /^\s*\d+(\.\d+)?\s*$/.test(v) && Number(v) > 0) return Number(v);
    return null;
  };
  const int = (k: string, d: number) => {
    const v = num(k);
    return v != null && v >= 1 ? Math.floor(v) : d;
  };
  return {
    pinEnabled: map.get("pin_enabled") === true,
    smsLogin: map.get("sms_login") === true,
    parkingRefRateFactor: num("parking_ref_rate_factor") ?? DEFAULT_RULES.parkingRefRateFactor,
    priceBlockMultiple: (() => {
      const v = num("price_block_multiple");
      return v != null && v >= 1 ? v : DEFAULT_RULES.priceBlockMultiple;
    })(),
    limitDiningPerDay: int("limit_dining_per_day", DEFAULT_RULES.limitDiningPerDay),
    limitDiningBranchPerDay: int(
      "limit_dining_branch_per_day",
      DEFAULT_RULES.limitDiningBranchPerDay,
    ),
    limitParkingPerDay: int("limit_parking_per_day", DEFAULT_RULES.limitParkingPerDay),
  };
}

/** 「兩倍」「三倍」「1.5 倍」 */
export function multipleWord(m: number): string {
  const zh: Record<number, string> = { 2: "兩倍", 3: "三倍", 4: "四倍", 5: "五倍" };
  return zh[m] ?? `${m} 倍`;
}

export type PriceCheck = {
  /** 參考價（成張計） */
  ref: number;
  /** 最多可以收幾多 */
  cap: number;
  /** 每位／每個鐘嘅參考價 */
  per: number;
  /** 「2 位，每位 $50」 */
  basis: string;
  level: "ok" | "over" | "blocked";
};

/** 香港時間今日係唔係星期六日（用假日時租） */
export function hkWeekend(now = Date.now()): boolean {
  const d = new Date(now + 8 * 3600_000).getUTCDay();
  return d === 0 || d === 6;
}

/** 商場今日嘅停車場時租（星期六日用假日時租，冇就用平日）；冇資料就 null。伺服器 aah__mall_rate 用同一個計法 */
export function mallRateToday(
  mall: Pick<AahMall, "rateWeekday" | "rateWeekend"> | null | undefined,
  now = Date.now(),
): number | null {
  if (!mall) return null;
  const ok = (v: number | null | undefined) =>
    v != null && Number.isFinite(v) && v > 0 ? v : null;
  if (hkWeekend(now) && ok(mall.rateWeekend) != null) return ok(mall.rateWeekend);
  return ok(mall.rateWeekday);
}

/** 「時租一半」「時租」「時租 1.5 倍」 */
export function factorWord(f: number): string {
  return f === 0.5 ? "時租一半" : f === 1 ? "時租" : `時租 ${f} 倍`;
}

/**
 * 計參考價同封頂：淨係管放出嚟嘅泊車優惠單據（商場時租 × 比例 × 可換幾多個鐘）。
 * 餐廳排隊飛冇參考價（多謝費自己定）；商場冇時租資料就冇參考價。
 */
export function priceCheck(
  input: {
    scenario: ScenarioId;
    direction: Direction;
    price: number | null | undefined;
    hours?: unknown;
    rate?: number | null;
  },
  rules: Rules,
): PriceCheck | null {
  if (input.direction !== "have" || input.scenario !== "parking") return null;
  const rate = input.rate;
  const units = Number(input.hours);
  if (rate == null || !(rate > 0) || !(units > 0)) return null;
  const per = rate * rules.parkingRefRateFactor;
  const basis = `${units} 個鐘，按停車場時租 $${rate} 嘅${factorWord(rules.parkingRefRateFactor).replace(/^時租/, "") || "全數"}計`;
  const ref = Math.round(per * units);
  const cap = Math.round(per * units * rules.priceBlockMultiple);
  const p = input.price ?? 0;
  const level = p > cap ? "blocked" : p > ref ? "over" : "ok";
  return { ref, cap, per, basis, level };
}

export function postPriceCheck(
  post: Post,
  rules: Rules,
  mall: Pick<AahMall, "rateWeekday" | "rateWeekend"> | null | undefined,
  now = Date.now(),
): PriceCheck | null {
  return priceCheck(
    {
      scenario: post.scenario,
      direction: post.direction,
      price: post.price,
      hours: post.fields.hours,
      rate: mallRateToday(mall, now),
    },
    rules,
  );
}

/** 舖名比較：唔理大細楷同空格 */
export function shopKey(s: string | undefined | null): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "");
}

/** 香港時間今日 0 點 */
export function hkDayStart(now = Date.now()): number {
  const hk = new Date(now + 8 * 3600_000);
  return Date.UTC(hk.getUTCFullYear(), hk.getUTCMonth(), hk.getUTCDate()) - 8 * 3600_000;
}

export const limitText = {
  dining: (n: number) =>
    `今日已經放咗 ${n} 張餐廳排隊飛喇。為咗唔俾黃牛有機會，每人每日最多 ${n} 張，聽日再嚟啦！`,
  branch: (n: number, where?: string) =>
    `今日喺${where ?? "呢間分店"}已經放咗 ${n} 張。同一間分店每人每日最多 ${n} 張，唔想有人專登攞飛嚟炒。`,
  parking: (n: number) =>
    `今日已經放咗 ${n} 張泊車優惠單據喇。每人每日最多 ${n} 張，免得有人專登收單炒賣，聽日再嚟啦！`,
  priceTooHigh: (cap: number, multiple?: number) =>
    `價錢太高放唔到：最多 $${cap}${multiple ? `（參考價${multipleWord(multiple)}）` : ""}。我哋唔想有黃牛。`,
};

/** 放之前檢查今日上限；超咗就俾一句友善嘅解釋，冇超就 null */
export function dailyLimitMessage(
  posts: Post[],
  userId: string,
  draft: {
    scenario: ScenarioId;
    direction: Direction;
    mallId?: string;
    mallName?: string;
    shop?: string;
  },
  rules: Rules,
  now = Date.now(),
): string | null {
  const start = hkDayStart(now);
  const mine = posts.filter((p) => p.authorId === userId && p.createdAt >= start);
  if (draft.scenario === "dining") {
    const n = rules.limitDiningPerDay;
    if (mine.filter((p) => p.scenario === "dining").length >= n) return limitText.dining(n);
    const b = rules.limitDiningBranchPerDay;
    if (
      draft.shop?.trim() &&
      draft.mallId &&
      mine.filter(
        (p) =>
          p.scenario === "dining" &&
          p.mallId === draft.mallId &&
          shopKey(p.shop) === shopKey(draft.shop),
      ).length >= b
    )
      return limitText.branch(
        b,
        ` ${draft.mallName ?? ""} ${draft.shop.trim()} `.replace(/\s+/g, " "),
      );
  }
  if (draft.scenario === "parking" && draft.direction === "have") {
    const n = rules.limitParkingPerDay;
    if (mine.filter((p) => p.scenario === "parking" && p.direction === "have").length >= n)
      return limitText.parking(n);
  }
  return null;
}

/** 傾偈打咗電話、email、WhatsApp、IG 呢類聯絡資料 */
export const CONTACT_RE =
  /(\d[\s-]?){8,}|[\w.+-]+@[\w-]+\.[\w.]+|whats\s*app|\bwts\b|\bwa\b|telegram|\btg\b|signal|wechat|微信|line\s*id|\big\b|ig\s*:|instagram/i;
export const CONTACT_WARNING = "交換聯絡資料有機會令個人資料外洩，請小心。喺 app 入面傾就夠。";
