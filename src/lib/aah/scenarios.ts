import type { Direction, PayMethod, ScenarioId } from "./types";

export type FieldDef = {
  key: string;
  label: string;
  type: "number" | "text" | "choice";
  /** type = choice 嘅選項 */
  options?: string[];
  placeholder?: string;
  suffix?: string;
  required?: boolean;
  /** 只喺某個方向顯示 */
  onlyFor?: Direction[];
  /** 只喺商場有食肆單規則（額外加鐘，或者某一級要包括食肆單）先顯示 */
  onlyIfDiningRule?: boolean;
  /** 金額可以有小數（例如收據 $627.6） */
  decimal?: boolean;
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
  /** 交收前要知：有嘢俾人嗰個（giver）同接收嗰個（taker）各自要留意嘅規則 */
  tips: { giver: string[]; taker: string[] };
  /** 置頂推唔推附近商場 */
  pushNearby: boolean;
};

export const SCENARIOS: Record<ScenarioId, ScenarioDef> = {
  parking: {
    id: "parking",
    label: "泊車優惠單據",
    emoji: "🚗",
    color: "#2E9E6A",
    soft: "#E3F5EC",
    directions: ["have", "want"],
    shopLabel: null,
    shopSuggestions: [],
    fields: [
      { key: "receiptAmount", label: "單據消費金額", type: "number", placeholder: "例如 520 或 627.6", suffix: "元", required: true, onlyFor: ["have"], decimal: true },
      { key: "receiptCount", label: "幾多張單？", type: "choice", options: ["1 張", "2 張", "3 張或以上"], required: true, onlyFor: ["have"] },
      { key: "receiptType", label: "單據類型", type: "choice", options: ["紙單", "電子單"], required: true, onlyFor: ["have"] },
      { key: "receiptCategory", label: "入面有冇食肆（餐廳）單？", type: "choice", options: ["有食肆單", "冇食肆單"], required: true, onlyFor: ["have"], onlyIfDiningRule: true },
      { key: "hours", label: "想要幾多個鐘", type: "number", placeholder: "例如 2", suffix: "個鐘", required: true, onlyFor: ["want"] },
    ],
    hasPrice: true,
    timeQuestion: "你大約幾點離開商場？",
    meetPlaces: ["詢問處／換泊車處", "停車場繳費處", "商場正門"],
    handoverHint: "喺詢問處或者換泊車嘅地方見面，一齊去換；單據同信用卡底單唔使交俾對方，換完由放嘅人攞返",
    tips: {
      giver: [
        "每個商場換泊車條款唔同：消費金額、換幾多個鐘、平日同假期都唔同，出 post 前睇清楚商場最新條款。",
        "好多商場要用商場 app 或者電子單據登記先換到泊車；已經登記咗喺你會員帳戶嘅消費通常轉唔到。喺 post 講清楚係紙單定電子單。",
        "單據一般要即日、喺同一個商場消費；好多商場最多合併 2 張單，有啲完全唔收合併、分拆，或者唔收影印本。",
        "已經換過泊車嘅單據唔好再俾人。",
        "單據成日連住信用卡底單，上面有部分卡號同簽名。唔好交俾對方，約喺詢問處或者換泊車嘅地方一齊去換，換完自己攞返。",
      ],
      taker: [
        "接之前問清楚係紙單定電子單、幾多張單、消費金額同日期，同你要換嘅條款夾唔夾；幾張單加埋計嘅，自己同商場確認收唔收。",
        "問清楚喺邊度換（客務台、繳費機定商場 app），預留時間喺離場前換。",
        "一齊去詢問處或者換泊車嘅地方換，換到先俾錢。張單同信用卡底單係對方嘅，換完俾返佢。",
      ],
    },
    pushNearby: false,
  },
  dining: {
    id: "dining",
    label: "餐廳排隊飛",
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
    tips: {
      giver: [
        "部分餐廳唔准轉讓飛，或者入座時要核對電話同人數；出 post 前確認轉得。",
        "用手機排隊、綁咗電話號碼嘅飛通常轉唔到。",
        "留意叫號進度，過咗號會作廢。",
        "收嘅錢叫「多謝費」，係多謝對方，唔係賣飛。啱啱好唔支持炒飛：每日放幾多張有上限，多謝費太高會放唔到。",
      ],
      taker: [
        "人數要同張飛一樣：2 位嘅飛唔啱 4 個人用。",
        "問清楚而家叫到幾號，預算時間去到餐廳門口。",
        "餐廳有權唔接受轉讓嘅飛，有爭議以餐廳決定為準。",
      ],
    },
    pushNearby: true,
  },
  offer: {
    id: "offer",
    label: "優惠券",
    emoji: "🎟",
    color: "#D9548F",
    soft: "#FBE6EF",
    directions: ["have", "want"],
    shopLabel: "邊間舖？",
    shopSuggestions: ["百佳", "惠康", "屈臣氏", "萬寧", "UNIQLO", "H&M"],
    fields: [
      { key: "title", label: "優惠內容", type: "text", placeholder: "例如 $50 現金券", required: true },
      { key: "faceValue", label: "面值（冇就留空）", type: "number", placeholder: "例如 50", suffix: "元", onlyFor: ["have"], decimal: true },
    ],
    hasPrice: true,
    timeQuestion: "你大約幾點離開商場？",
    meetPlaces: ["舖頭門口", "商場正門"],
    handoverHint: "交券或者俾對方掃碼",
    tips: {
      giver: [
        "睇清楚有效期、使用條款同適用分店。",
        "綁咗 app 或者會員帳戶嘅電子券通常轉唔到；確認可以轉贈先出 post。",
        "實體券、印花要完整、冇用過。",
      ],
      taker: [
        "接之前睇清楚優惠內容、有效期同限制，例如最低消費、指定貨品。",
        "電子券最好即場轉贈或者用，確認成功先俾錢。",
      ],
    },
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
    tips: {
      giver: [
        "優惠條件以舖頭為準，例如要同一張單、指定貨品。",
        "喺 post 講清楚想買咩、每人大約俾幾多。",
        "見面一齊去收銀處，講好點樣夾錢先埋單。",
      ],
      taker: [
        "優惠條件以舖頭為準，例如要同一張單、指定貨品。",
        "加入前講清楚你想買咩、大約俾幾多。",
        "見面一齊去收銀處，講好點樣夾錢先埋單。",
      ],
    },
    pushNearby: true,
  },
};

export const SCENARIO_LIST: ScenarioId[] = ["parking", "dining", "offer", "groupbuy"];

export const GROUPBUY_DEALS = ["買一送一", "第二件半價", "買二送一", "滿額減"];

export const DIRECTION_LABEL: Record<Direction, string> = {
  have: "有人放",
  want: "有人想要",
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
        ? `${f.hours ? `可換 ${f.hours} 個鐘` : `消費 $${f.receiptAmount}`}${f.receiptCount && f.receiptCount !== "1 張" ? `・${f.receiptCount}單` : ""}${hasDiningReceipt(f) ? "・有食肆單" : ""}${f.receiptType ? `・${f.receiptType}` : ""}`
        : `要 ${f.hours} 個鐘`;
    case "dining":
      return `${f.queueNo}・${f.partySize} 位${f.calling ? `・而家叫到 ${f.calling}` : ""}`;
    case "offer":
      return String(f.title ?? "");
    case "groupbuy":
      return `${f.deal}${f.note ? `・${f.note}` : ""}${needCount ? `・仲要 ${needCount} 人` : ""}`;
  }
}

/** 泊車收據入面有冇食肆單（「食肆單」係舊寫法） */
export function hasDiningReceipt(f: Record<string, string | number | undefined>): boolean {
  return f.receiptCategory === "有食肆單" || f.receiptCategory === "食肆單";
}

/** 計鐘用：有食肆單 → true；講明冇 → false；冇揀 → undefined（唔知就照計要食肆單嗰級） */
export function diningFlag(f: Record<string, string | number | undefined>): boolean | undefined {
  if (hasDiningReceipt(f)) return true;
  if (f.receiptCategory === "冇食肆單") return false;
  return undefined;
}

/** 金額輸入：淨係收數字同一個小數點，最多兩個位小數 */
export function cleanMoneyInput(v: string, maxInt = 6): string {
  const s = v.replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot < 0) return s.slice(0, maxInt);
  return `${s.slice(0, dot).slice(0, maxInt)}.${s.slice(dot + 1).replace(/\./g, "").slice(0, 2)}`;
}

/**
 * 幾張單加埋計嘅提醒（唔阻止出 post，只係提醒）：
 * 唔係個個商場收合併單，好多最多 2 張，3 張或以上好少見。
 */
/** 由「支援拼單」資料讀出最多幾多張：❌ 不可拼單 = 1；「最多2張」= 2；未知 = null */
export function maxReceipts(stacking: string | null | undefined): number | null {
  if (!stacking || stacking.includes("待確認")) return null;
  if (/❌|不可|唔可以|不接受/.test(stacking)) return 1;
  const m = /最多\s*(\d+)\s*張/.exec(stacking);
  return m ? Number(m[1]) : null;
}

export function receiptCountNote(count: string | number | undefined, role: "giver" | "taker", stacking?: string | null): string | null {
  const own = "平台只係俾大家配對，換唔換到、有冇風險，要雙方自己衡量。";
  const n = count === "2 張" ? 2 : count === "3 張或以上" ? 3 : 1;
  const max = maxReceipts(stacking);
  if (n > 1 && max != null) {
    const rule = max === 1 ? "唔收合併單" : `最多合併 ${max} 張`;
    if (n > max) {
      return role === "giver"
        ? `呢個商場資料顯示${rule}（參考），你揀咗 ${count}，對方可能換唔到，出 post 前問清楚商場。${own}`
        : `呢份係 ${count}單加埋計，但呢個商場資料顯示${rule}（參考），可能換唔到，接之前自己同商場確認。${own}`;
    }
    return role === "giver"
      ? `呢個商場資料顯示${rule}（參考），以商場最新規定為準。${own}`
      : `呢份係 ${count}單加埋計，商場資料顯示${rule}（參考），接之前自己同商場確認。${own}`;
  }
  if (count === "2 張") {
    return role === "giver"
      ? `唔係個個商場收合併單，出 post 前睇清楚條款。${own}`
      : `呢份係 2 張單加埋計，唔係個個商場收合併單，接之前自己同商場確認。${own}`;
  }
  if (count === "3 張或以上") {
    return role === "giver"
      ? `好少商場收 3 張或以上合併，好多最多 2 張。出 post 前問清楚商場，免得對方換唔到。${own}`
      : `呢份係 3 張或以上單加埋計。好少商場收咁多張（好多最多 2 張），接之前自己同商場確認。${own}`;
  }
  return null;
}

/** 呢個 post 嘅作者係「俾嘢」定「接收」嗰個 */
export function authorRole(direction: Direction): "giver" | "taker" {
  return direction === "want" ? "taker" : "giver";
}
