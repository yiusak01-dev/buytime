import type { ScenarioId } from "./types";

/** 10C 柔和風格：搵＝紫、放＝橙、夾＝綠，去到邊頁都同一個色 */
export const INK = "#2B2433";
export const MUTED = "#5E5568";
export const GROUND = "#FFF4EC";
export const LINE = "#EADFD3";
export const DIVIDER = "#F3ECE4";
export const LIVE = "#1FA463";
export const LIVE_TEXT = "#16774A";

export type Verb = "find" | "give" | "join";

export const VERBS: Record<
  Verb,
  {
    word: string;
    sub: string;
    soft: string;
    strong: string;
    text: string;
    to: "/" | "/give" | "/join";
  }
> = {
  find: {
    word: "搵",
    sub: "我想要",
    soft: "#E8E4FF",
    strong: "#3B2F8F",
    text: "#3B2F8F",
    to: "/",
  },
  give: {
    word: "放",
    sub: "我有，放出去",
    soft: "#FFD9C2",
    strong: "#9A3B0E",
    text: "#6E2F0C",
    to: "/give",
  },
  join: {
    word: "夾",
    sub: "搵人一齊買",
    soft: "#D6F2E2",
    strong: "#1E5C3F",
    text: "#1E5C3F",
    to: "/join",
  },
};

/** 類別：靠圖示同顏色分，唔用 emoji */
export const CAT_STYLE: Record<
  ScenarioId,
  { name: string; short: string; bg: string; fg: string }
> = {
  parking: { name: "泊車優惠單據", short: "泊車優惠單據", bg: "#E5EEFC", fg: "#2F55B5" },
  dining: { name: "餐廳排隊飛", short: "餐廳排隊飛", bg: "#FFF0C2", fg: "#8A5A00" },
  offer: { name: "優惠券", short: "優惠券", bg: "#FBE6EF", fg: "#A12D5E" },
  groupbuy: { name: "夾單", short: "夾單", bg: "#D6F2E2", fg: "#1E5C3F" },
};

/** 「搵」入面嘅類別（夾單喺「夾」頁） */
export const FIND_SCENARIOS: ScenarioId[] = ["parking", "dining", "offer"];

/** 第一次用嘅人未必知咩係泊車優惠單據：喺有位嘅地方講一次 */
export const PARKING_EXPLAIN = "商場消費單，夠數可以換免費泊車";

/** 未登記睇得幾多個 */
export const FREE_LIMIT = 3;
