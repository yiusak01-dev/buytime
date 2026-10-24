import type { User } from "./types";

export const POINTS = {
  /** 有嘢俾人嘅一方（最冇動機放，所以分數多啲） */
  giver: 30,
  /** 接收嘅一方 */
  taker: 10,
  /** 夾單雙方一樣 */
  groupbuy: 20,
  noShowPenalty: 50,
  dailyCap: 100,
  /** 100 分換一次置頂 */
  pinCost: 100,
  /** 1,000 分換 $50 百佳電子禮券 */
  voucherCost: 1000,
  voucherValue: 50,
  voucherMonthlyQuota: 50,
  /** 新帳戶要用夠 30 日先可以換禮券 */
  voucherMinAccountDays: 30,
};

const WEEK = 7 * 24 * 60 * 60 * 1000;

/** 防呃分：同一對人一星期內唔重複計分，每日有上限 */
export function canEarnPoints(user: User, partnerId: string, pts: number, now = Date.now()) {
  if (!partnerId) return 0;
  const repeated = user.pointLog.some((l) => l.partnerId === partnerId && l.pts > 0 && now - l.at < WEEK);
  if (repeated) return 0;
  const startOfDay = now - ((now + 8 * 3600 * 1000) % (24 * 3600 * 1000));
  const today = user.pointLog.filter((l) => l.at >= startOfDay).reduce((s, l) => s + l.pts, 0);
  return Math.max(0, Math.min(pts, POINTS.dailyCap - today));
}

export const LEVELS = [
  { min: 0, label: "新手", badge: "🌱" },
  { min: 100, label: "熟手", badge: "👍" },
  { min: 300, label: "啱啱好達人", badge: "🌟" },
  { min: 800, label: "啱啱好大使", badge: "👑" },
];

export function levelOf(lifetime: number) {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (lifetime >= l.min) cur = l;
  const next = LEVELS.find((l) => l.min > lifetime) ?? null;
  return { ...cur, next };
}
