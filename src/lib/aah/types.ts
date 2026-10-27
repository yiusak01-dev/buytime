// 啱啱好 — 核心資料型別

export type ScenarioId = "parking" | "dining" | "offer" | "groupbuy";

/** have = 我有、want = 我要、join = 搵人夾（夾單專用） */
export type Direction = "have" | "want" | "join";

export type PayMethod = "cash" | "payme" | "fps" | "octopus" | "alipay" | "wechat";

export type PostStatus = "open" | "matched" | "expired" | "cancelled";

export type Interest = {
  /** 雲端模式嘅 interest id */
  id?: string;
  userId: string;
  name: string;
  at: number;
  /** 買家提出嘅價錢（「$15 得唔得？」） */
  offer?: number;
  messages: { from: string; text: string; at: number }[];
  status: "pending" | "accepted" | "declined";
  /** 未到商場，去緊 */
  enRoute?: boolean;
  /** 去緊：講咗幾點到 */
  etaAt?: number;
  /** 去緊：撳有興趣嗰陣距離商場幾遠（米） */
  distanceM?: number;
  /** 撳有興趣嗰陣嘅紀錄（俾出 post 嘅人參考） */
  completed?: number;
  noShows?: number;
};

export type Post = {
  id: string;
  scenario: ScenarioId;
  direction: Direction;
  mallId: string;
  mallName: string;
  shop: string;
  /** 場景專用欄位，例如 hours、queueNo、partySize、faceValue */
  fields: Record<string, string | number>;
  /** null = 夾單（唔使價錢）；0 = 免費 */
  price: number | null;
  payMethods: PayMethod[];
  /** 預計離開商場（食飯 = 預計叫號）時間 */
  leaveAt: number;
  createdAt: number;
  authorId: string;
  authorName: string;
  /** 發 post 時 GPS 有冇真係確認喺場 */
  verifiedOnSite: boolean;
  status: PostStatus;
  pinnedUntil?: number;
  pushedCount: number;
  viewCount: number;
  interests: Interest[];
  matchId?: string;
  /** 第一個有興趣嘅自動配對 */
  autoAccept: boolean;
  /** 接唔接未到商場、去緊嘅人（預設接受；夾單一律唔接） */
  acceptEnRoute?: boolean;
  /** 夾單：仲要幾多個人 */
  needCount?: number;
  /** 示範資料（其他用戶） */
  demo?: boolean;
};

export type Outfit = {
  hair: "long" | "short";
  top: { style: "tshirt" | "shirt" | "sweater"; color: string };
  bottom: { style: "pants" | "shorts" | "skirt"; color: string };
  outer: { style: "none" | "coat" | "jacket"; color: string };
  accessories: ("cap" | "glasses" | "backpack" | "handbag")[];
};

export type Message = {
  id: string;
  from: string; // userId 或 "system"
  text: string;
  at: number;
};

export type MatchStatus = "active" | "completed" | "cancelled" | "noshow";

export type Match = {
  id: string;
  postId: string;
  scenario: ScenarioId;
  mallId: string;
  mallName: string;
  shop: string;
  price: number | null;
  payMethods: PayMethod[];
  authorId: string;
  /** 所有參與者（包括出 post 嘅人） */
  participants: { userId: string; name: string }[];
  meetPlace: string;
  meetAt: number;
  /** 邊啲人已經確認見面地點時間（確認時會彈冇出現警告） */
  confirmedBy: string[];
  arrived: Record<string, number>;
  outfits: Record<string, Outfit>;
  messages: Message[];
  status: MatchStatus;
  createdAt: number;
  endedAt?: number;
  rated?: "up" | "down";
  ratePromptShown?: boolean;
  /** 已經問過「對方到咗未？」 */
  askedArrival?: boolean;
  /** 邊個取消（雲端模式由資料庫記錄） */
  cancelledBy?: string;
  /** 對方已經到咗先取消 */
  lateCancel?: boolean;
  /** 配對咗嗰陣仲去緊嘅人 */
  enRouteUser?: string;
  /** 去緊嘅人講咗幾點到 */
  etaAt?: number;
};

export type User = {
  id: string;
  registered: boolean;
  phone?: string;
  /** 雲端模式：登入用嘅 email */
  email?: string;
  /** 雲端模式：已經登入（未必已建立 profile） */
  signedIn?: boolean;
  nickname?: string;
  registeredAt?: number;
  points: number;
  lifetimePoints: number;
  completed: number;
  noShows: number;
  bannedUntil?: number;
  appeal?: { text: string; at: number; status: "pending" | "approved" | "rejected" };
  onboarded: boolean;
  notifyCats: ScenarioId[];
  notifyOpportunities: boolean;
  notifyPromotions: boolean;
  defaultPayMethods: PayMethod[];
  outfitToday?: { date: string; outfit: Outfit };
  /** 測試位置：唔喺商場都可以試用 */
  testMallId?: string | null;
  pinCredits: number;
  /** 每個商場每日到埗通知紀錄 key = mallId|yyyy-mm-dd */
  arrivalShown: Record<string, true>;
  /** 計分紀錄：防同一對人重複儲分 */
  pointLog: { at: number; partnerId: string; pts: number }[];
  voucherRequests: { at: number; status: "pending" }[];
  /** 30 日內臨時取消次數 */
  lateCancels30d?: number;
  /** 示範模式：臨時取消時間紀錄 */
  lateCancelLog?: number[];
};

export type AahMall = {
  id: string;
  name: string;
  district: string;
  lat: number;
  lng: number;
  /** 商場範圍半徑（米） */
  radius: number;
  /** 平日換泊車條件，例如 "$300=2hr | $500=3hr" */
  condWeekday: string | null;
  /** 星期六日及公眾假期 */
  condWeekend: string | null;
  rateWeekday: number | null;
  rateWeekend: number | null;
  /** 支援拼單，例如「✅ 最多2張」「❌ 不可拼單」「待確認」（每週由商場資料庫同步） */
  stacking?: string | null;
  /** 資料來源 */
  source: "db" | "sample";
};
