import type { ScenarioId } from "./types";

/**
 * 首頁、搵、放、歡迎頁共用嘅文案：講清楚兩邊都有着數，短、用香港人講法。
 * 改字只改呢度，全 app 一齊變。
 */
export const TAGLINE = "用唔着嘅轉俾人，大家都有着數";

export const FIND = {
  word: "搵",
  value: "泊車平啲，食飯唔使排",
  cats: "泊車優惠單據・餐廳排隊飛・優惠券・夾單",
};

export const GIVE = {
  word: "放",
  value: "用唔着嘅，換返啲錢",
  cats: "泊車優惠單據・餐廳排隊飛・優惠券・夾單",
};

/** 「放」：每個類別一句大字（你有咩）、一句細字（兩邊有咩着數） */
export const GIVE_CATS: Record<ScenarioId, { name: string; head: string; sub: string }> = {
  parking: { name: "泊車優惠單據", head: "冇揸車？張單據有人要", sub: "你收返錢，佢泊車平啲" },
  dining: { name: "餐廳排隊飛", head: "唔去食？張排隊飛有人要", sub: "你收返錢，佢唔使由頭排" },
  offer: { name: "優惠券", head: "券用唔晒？有人要", sub: "你回返啲本，佢買平嘢" },
  groupbuy: { name: "夾單", head: "一個人買唔抵？搵人夾", sub: "買一送一、第二件半價，一齊平" },
};

/** 「搵」：每個類別一句講你有咩着數 */
export const FIND_CATS: Record<ScenarioId, { name: string; head: string }> = {
  parking: { name: "泊車優惠單據", head: "泊車平過正價" },
  dining: { name: "餐廳排隊飛", head: "唔使由頭排" },
  offer: { name: "優惠券", head: "買嘢平啲" },
  groupbuy: { name: "夾單", head: "搵人一齊平" },
};

/** 第一次用：3 步講明 */
export const HOW_STEPS: { word: string; text: string }[] = [
  { word: "放", text: "用唔着嘅泊車優惠單據、餐廳排隊飛、優惠券，影相放上嚟" },
  { word: "搵", text: "附近啱用嘅人撳「有興趣」" },
  { word: "換", text: "喺商場見面，一手交錢一手交貨" },
];
