import { calcParkingHours, diningExtraHours } from "@/lib/parking-rules";
import type { AahMall } from "./types";

/**
 * 香港公眾假期（2026）。上線前請對照 gov.hk 公佈核實；
 * 星期日本身已經當週末計，所以只需要列平日嘅假期。
 */
export const HK_PUBLIC_HOLIDAYS = new Set<string>([
  "2026-01-01",
  "2026-02-17", "2026-02-18", "2026-02-19",
  "2026-04-03", "2026-04-04", "2026-04-06", "2026-04-07",
  "2026-05-01", "2026-05-25",
  "2026-06-19",
  "2026-07-01",
  "2026-09-26",
  "2026-10-01", "2026-10-19",
  "2026-12-25", "2026-12-26",
]);

const WEEKDAY_ZH = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

/** 用香港時間取日期 */
export function hkDateParts(ts: number) {
  const d = new Date(ts + 8 * 3600 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return { iso: `${y}-${m}-${day}`, dow: d.getUTCDay(), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

export type DayInfo = { weekend: boolean; label: string };

export function dayInfo(ts: number): DayInfo {
  const { iso, dow } = hkDateParts(ts);
  if (HK_PUBLIC_HOLIDAYS.has(iso)) return { weekend: true, label: "公眾假期" };
  if (dow === 0 || dow === 6) return { weekend: true, label: WEEKDAY_ZH[dow] };
  return { weekend: false, label: WEEKDAY_ZH[dow] };
}

/** 統一唔同寫法：「$200/1hr」→「$200=1hr」（「@$5/hr」呢類優惠價唔會被改） */
export function normalizeCond(cond: string | null | undefined): string | null {
  if (!cond) return null;
  return cond.replace(/\$\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*hr/gi, "$$$1=$2hr");
}

/** 領展等商場：「全部@$5/hr」即係換到嘅鐘數按每小時 $5 收，唔係免費 */
export function discountedRate(cond: string | null | undefined): number | null {
  const m = cond ? /@\s*\$\s*(\d+(?:\.\d+)?)\s*\/\s*hr/i.exec(cond) : null;
  return m ? Number(m[1]) : null;
}

function rulesFor(mall: AahMall, ts: number) {
  const day = dayInfo(ts);
  const raw = day.weekend ? mall.condWeekend ?? mall.condWeekday : mall.condWeekday;
  const rate = day.weekend ? mall.rateWeekend ?? mall.rateWeekday : mall.rateWeekday;
  const disc = discountedRate(raw);
  // 每個鐘慳到嘅錢：免費就係成個時租；優惠價就係時租減優惠價
  const perHour = rate == null ? null : disc != null ? Math.max(0, rate - disc) : rate;
  return { day, cond: normalizeCond(raw), rate, perHour, disc };
}

/** 呢個商場有冇「食肆單額外加鐘」（平日或者假期任何一邊有都算） */
export function mallDiningExtra(mall: AahMall | null | undefined): number | null {
  if (!mall) return null;
  return diningExtraHours(mall.condWeekday) ?? diningExtraHours(mall.condWeekend);
}

export type ParkingQuote = {
  hours: number;
  rate: number | null;
  saving: number | null;
  /** 建議唔好超過（慳到嘅一半） */
  suggestMax: number | null;
  dayLabel: string;
  belowThreshold: boolean;
  minThreshold: number;
  cond: string | null;
  /** 換到嘅鐘數每個鐘仲要俾停車場幾多（例如領展 $5）；免費就 null */
  discRate: number | null;
  /** 換到嘅鐘數合共要俾停車場幾多（hours × discRate） */
  copay: number | null;
  /** 今日規則食肆單可以額外加幾多個鐘；冇呢條規則就 null */
  diningExtra: number | null;
  /** 今次計咗食肆單額外加幾多個鐘 */
  extraApplied: number;
};

/** 賣家：張收據可以換幾多個鐘、慳幾多；dining = 係咪食肆單 */
export function quoteParkingReceipt(mall: AahMall, receiptAmount: number, ts: number, opts: { dining?: boolean } = {}): ParkingQuote {
  const { day, cond, rate, perHour, disc } = rulesFor(mall, ts);
  const r = calcParkingHours(cond, receiptAmount, { dining: opts.dining });
  const saving = perHour != null ? Math.round(r.hours * perHour) : null;
  return {
    hours: r.hours,
    rate,
    saving,
    suggestMax: saving != null ? Math.floor(saving / 2) : null,
    dayLabel: day.label,
    belowThreshold: r.belowThreshold,
    minThreshold: r.minThreshold,
    cond,
    discRate: disc,
    copay: disc != null ? Math.round(r.hours * disc) : null,
    diningExtra: diningExtraHours(cond),
    extraApplied: r.extraHours,
  };
}

/** 「我要」泊車：想要嘅鐘數值幾多錢（fee = 用收據慳到嘅錢；full = 正價） */
export function quoteParkingWant(mall: AahMall, hours: number, ts: number) {
  const { day, rate, perHour, disc } = rulesFor(mall, ts);
  const fee = perHour != null ? Math.round(hours * perHour) : null;
  return {
    fee,
    rate,
    full: rate != null ? Math.round(hours * rate) : null,
    discRate: disc,
    copay: disc != null ? Math.round(hours * disc) : null,
    suggestMax: fee != null ? Math.floor(fee / 2) : null,
    dayLabel: day.label,
  };
}

/**
 * 買家：輸入幾點入停車場，計實際慳幾多。
 * 停車場一般按「每小時或不足一小時」收費，所以向上取整。
 */
export function buyerParkingSaving(mall: AahMall, hoursOffered: number, entryTs: number, now: number) {
  const { day, rate, perHour } = rulesFor(mall, now);
  const parked = Math.max(1, Math.ceil((now - entryTs) / 3600000));
  if (rate == null || perHour == null) return null;
  const fee = parked * rate;
  const saving = Math.min(hoursOffered, parked) * perHour;
  // 用收據之後仲要俾停車場幾多（例如領展換到嘅鐘數每個鐘 $5，加埋超出嘅鐘數正價）
  return { parked, fee, saving, payAfter: fee - saving, dayLabel: day.label, rate };
}

/** 優惠券：建議唔好超過面值一半 */
export function quoteOffer(faceValue: number) {
  return { suggestMax: Math.floor(faceValue / 2) };
}
