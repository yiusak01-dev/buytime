import type { Direction, PayMethod, ScenarioId } from "./types";

export type FieldDef = {
  key: string;
  label: string;
  type: "number" | "text";
  placeholder?: string;
  suffix?: string;
  required?: boolean;
  /** 只喺某個方向顯示 */
  onlyFor?: Direction[];
};

export type ScenarioDef = {
  id: ScenarioId;
  label: string;
  emoji: string;
  /** 卡片色帶 / 標籤顏色 */
  color: string;
  soft: string;
  directions: Direction[];
  /** 舖頭欄位標題；null = 唔使揀舖頭（泊車固定停車場） */
  shopLabel: string | null;
  shopSuggestions: string[];
  fields: FieldDef[];
  /** 夾單唔使價錢 */
  hasPrice: boolean;
  /** 時間欄位問乜 */
  timeQuestion: string;
  meetPlaces: string[];
  /** 見面點完成 */
  handoverHint: string;
  /** 出 post 要特別提醒 */
  warning?: string;
  /** $5 置頂推唔推附近商場 */
  pushNearby: boolean;
};

export const SCENARIOS: Record<ScenarioId, ScenarioDef> = {
  parking: {
    id: "parking",
    label: "泊車",
    emoji: "🚗",
    color: "#2E9E6A",
    soft: "#E3F5EC",
    directions: ["have", "want"],
    shopLabel: null,
    shopSuggestions: [],
    fields: [
      { key: "receiptAmount", label: "收據消費金額", type: "number", placeholder: "例如 520", suffix: "元", required: true, onlyFor: ["have"] },
      { key: "hours", label: "想要幾多個鐘", type: "number", placeholder: "例如 2", suffix: "個鐘", required: true, onlyFor: ["want"] },
    ],
    hasPrice: true,
    timeQuestion: "你大約幾點離開商場？",
    meetPlaces: ["客戶服務台", "停車場繳費機", "商場正門"],
    handoverHint: "見面交收據，一手交錢一手交收據",
    warning: "呢個商場要用實體收據換泊車先適用；綁咗會員 app 嘅消費轉唔到。",
    pushNearby: false,
  },
  dining: {
    id: "dining",
    label: "食飯",
    emoji: "🍜",
    color: "#3D7BE0",
    soft: "#E5EEFC",
    directions: ["have"],
    shopLabel: "邊間餐廳？",
    shopSuggestions: ["鼎泰豐", "添好運", "譚仔三哥", "大家樂", "美心皇宮", "一蘭"],
    fields: [
      { key: "queueNo", label: "飛號", type: "text", placeholder: "例如 A038", required: true },
      { key: "partySize", label: "幾多位", type: "number", placeholder: "例如 2", suffix: "位", required: true },
      { key: "calling", label: "而家叫到幾號", type: "text", placeholder: "例如 A021" },
    ],
    hasPrice: true,
    timeQuestion: "預計幾點叫到號？",
    meetPlaces: ["餐廳門口", "商場正門"],
    handoverHint: "喺餐廳門口交飛",
    warning: "人數要啱：2 位嘅飛唔啱 4 個人用。用手機排隊、綁咗電話號碼嘅飛轉唔到。",
    pushNearby: true,
  },
  offer: {
    id: "offer",
    label: "優惠",
    emoji: "🎟",
    color: "#D9548F",
    soft: "#FBE6EF",
    directions: ["have", "want"],
    shopLabel: "邊間舖？",
    shopSuggestions: ["百佳", "惠康", "屈臣氏", "萬寧", "UNIQLO", "H&M"],
    fields: [
      { key: "title", label: "優惠內容", type: "text", placeholder: "例如 $50 現金券", required: true },
      { key: "faceValue", label: "面值（冇就留空）", type: "number", placeholder: "例如 50", suffix: "元", onlyFor: ["have"] },
    ],
    hasPrice: true,
    timeQuestion: "你大約幾點離開商場？",
    meetPlaces: ["舖頭門口", "商場正門"],
    handoverHint: "交券或者俾對方掃碼",
    warning: "綁咗 app 或者會員帳戶嘅優惠轉唔到，出 post 前確認可以俾人用。",
    pushNearby: true,
  },
  groupbuy: {
    id: "groupbuy",
    label: "夾單",
    emoji: "🛍",
    color: "#E8642A",
    soft: "#FDEBE1",
    directions: ["join"],
    shopLabel: "邊間舖？",
    shopSuggestions: ["Nike", "adidas", "UNIQLO", "H&M", "ZARA", "GU"],
    fields: [
      { key: "deal", label: "咩優惠", type: "text", placeholder: "例如 第二件半價", required: true },
      { key: "note", label: "想買咩（可以唔填）", type: "text", placeholder: "例如 波鞋" },
    ],
    hasPrice: false,
    timeQuestion: "你大約幾點離開商場？",
    meetPlaces: ["舖頭門口", "商場正門"],
    handoverHint: "見面一齊去收銀處，各自俾自己嗰份",
    pushNearby: true,
  },
};

export const SCENARIO_LIST: ScenarioId[] = ["parking", "dining", "offer", "groupbuy"];

export const GROUPBUY_DEALS = ["買一送一", "第二件半價", "買二送一", "滿額減"];

export const DIRECTION_LABEL: Record<Direction, string> = {
  have: "有",
  want: "要",
  join: "搵人夾",
};

export const PAY_METHODS: { id: PayMethod; label: string }[] = [
  { id: "cash", label: "現金" },
  { id: "payme", label: "PayMe" },
  { id: "fps", label: "轉數快" },
  { id: "octopus", label: "八達通" },
  { id: "alipay", label: "支付寶HK" },
  { id: "wechat", label: "WeChat Pay" },
];

export function payLabel(ids: PayMethod[]) {
  return ids.map((id) => PAY_METHODS.find((p) => p.id === id)?.label ?? id).join("／");
}

/** 卡片上嗰行關鍵資料 */
export function keyInfo(s: ScenarioId, dir: Direction, f: Record<string, string | number>, needCount?: number): string {
  switch (s) {
    case "parking":
      return dir === "have"
        ? f.hours ? `可換 ${f.hours} 個鐘` : `消費 $${f.receiptAmount}`
        : `要 ${f.hours} 個鐘`;
    case "dining":
      return `${f.queueNo}・${f.partySize} 位${f.calling ? `・而家叫到 ${f.calling}` : ""}`;
    case "offer":
      return String(f.title ?? "");
    case "groupbuy":
      return `${f.deal}${f.note ? `・${f.note}` : ""}${needCount ? `・仲要 ${needCount} 人` : ""}`;
  }
}
