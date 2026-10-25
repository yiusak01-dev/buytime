import { useSyncExternalStore } from "react";
import type { AahMall, Interest, Match, Message, Outfit, Post, User } from "./types";
import { SCENARIOS } from "./scenarios";
import { quoteParkingReceipt } from "./pricing";
import { POINTS, canEarnPoints } from "./points";
import { createRemote, detectRemote, type LocalPrefs, type Remote, type RemoteSettings } from "./remote";

/**
 * 兩個模式：
 *  - 雲端（remote）：Supabase 嘅 aah_* 資料表已經開咗，post 同配對大家都睇到
 *  - 示範（local）：資料表未開，所有嘢存喺呢部電話（localStorage），有示範 post
 * 開 app 時自動偵測。畫面只用 `aah` 嘅 async action，唔使理係邊個模式。
 */

const KEY = "aah:v1";
const MIN = 60 * 1000;
export const DAY = 24 * 60 * MIN;
export const BAN_DAYS = 30;
export const MAX_PINNED_PER_MALL = 10;
export const PIN_MINUTES = 15;
export const PIN_PROMPT_AFTER_MIN = 15;
export const CHAT_CLOSE_AFTER_MIN = 30;
export const DINING_POSTS_PER_DAY = 3;
export const LEAVE_GRACE_MIN = 5;

type State = {
  user: User;
  posts: Post[];
  matches: Match[];
};

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
}

function freshUser(): User {
  return {
    id: uid("me"),
    registered: false,
    points: 0,
    lifetimePoints: 0,
    completed: 0,
    noShows: 0,
    onboarded: false,
    notifyCats: ["parking", "dining", "offer", "groupbuy"],
    notifyOpportunities: true,
    notifyPromotions: false,
    defaultPayMethods: ["cash", "payme"],
    testMallId: null,
    pinCredits: 0,
    arrivalShown: {},
    pointLog: [],
    voucherRequests: [],
  };
}

function load(): State {
  if (typeof window === "undefined") return { user: freshUser(), posts: [], matches: [] };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as State;
      return { user: { ...freshUser(), ...parsed.user }, posts: parsed.posts ?? [], matches: parsed.matches ?? [] };
    }
  } catch {
    /* 讀唔到就由頭開始 */
  }
  // 雲端模式唔會存 aah:v1，用返之前儲低嘅設定（例如已經睇過歡迎頁、測試位置），唔好每次重新載入都跳返歡迎頁
  try {
    const prefsRaw = window.localStorage.getItem("aah:prefs");
    if (prefsRaw) {
      const p = JSON.parse(prefsRaw);
      return { user: { ...freshUser(), onboarded: !!p.onboarded, testMallId: p.testMallId ?? null, arrivalShown: p.arrivalShown ?? {}, outfitToday: p.outfitToday }, posts: [], matches: [] };
    }
  } catch {
    /* 用預設 */
  }
  return { user: freshUser(), posts: [], matches: [] };
}

let state: State = load();
let listeners: Array<() => void> = [];

function persist() {
  if (typeof window === "undefined" || mode === "remote") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 私密瀏覽等情況寫唔到，照用記憶體 */
  }
}

function set(next: State) {
  state = next;
  persist();
  listeners.forEach((l) => l());
}

function patchPost(id: string, fn: (p: Post) => Post) {
  set({ ...state, posts: state.posts.map((p) => (p.id === id ? fn(p) : p)) });
}

function patchMatch(id: string, fn: (m: Match) => Match) {
  set({ ...state, matches: state.matches.map((m) => (m.id === id ? fn(m) : m)) });
}

function sysMsg(text: string): Message {
  return { id: uid("msg"), from: "system", text, at: Date.now() };
}

export function todayKey(ts = Date.now()) {
  const d = new Date(ts + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

export function isBanned(u: User, now = Date.now()) {
  return !!u.bannedUntil && u.bannedUntil > now;
}

export function displayName(u: User) {
  return u.nickname || "你";
}

/* ---------------- 示範用戶 ---------------- */

const DEMO_OUTFITS: Outfit[] = [
  { hair: "short", top: { style: "tshirt", color: "#1F2937" }, bottom: { style: "pants", color: "#1E3A8A" }, outer: { style: "none", color: "#000" }, accessories: ["cap"] },
  { hair: "long", top: { style: "shirt", color: "#F9FAFB" }, bottom: { style: "skirt", color: "#111827" }, outer: { style: "coat", color: "#A16207" }, accessories: ["handbag"] },
  { hair: "long", top: { style: "sweater", color: "#DC2626" }, bottom: { style: "pants", color: "#374151" }, outer: { style: "none", color: "#000" }, accessories: ["glasses", "backpack"] },
  { hair: "short", top: { style: "shirt", color: "#2563EB" }, bottom: { style: "shorts", color: "#9CA3AF" }, outer: { style: "jacket", color: "#15803D" }, accessories: [] },
];

export const DEMO_PEOPLE = [
  { id: "demo-ming", name: "阿明", outfit: DEMO_OUTFITS[0] },
  { id: "demo-karen", name: "Karen", outfit: DEMO_OUTFITS[1] },
  { id: "demo-shan", name: "小珊", outfit: DEMO_OUTFITS[2] },
  { id: "demo-ken", name: "Ken", outfit: DEMO_OUTFITS[3] },
  { id: "demo-chan", name: "陳生", outfit: DEMO_OUTFITS[0] },
];

function demoPerson(id: string) {
  return DEMO_PEOPLE.find((p) => p.id === id) ?? DEMO_PEOPLE[0];
}

/* ---------------- Actions ---------------- */

const local = {
  get: () => state,
  subscribe(fn: () => void) {
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((l) => l !== fn);
    };
  },

  updateUser(patch: Partial<User>) {
    set({ ...state, user: { ...state.user, ...patch } });
  },

  register(phone: string, nickname: string) {
    set({ ...state, user: { ...state.user, registered: true, phone, nickname, registeredAt: Date.now() } });
  },

  resetDemo() {
    set({ user: { ...freshUser(), onboarded: true }, posts: [], matches: [] });
  },

  /** 確保呢個商場有示範 post（其他用戶），方便試用 */
  ensureDemoPosts(mall: AahMall) {
    const now = Date.now();
    const alive = state.posts.some((p) => p.demo && p.mallId === mall.id && p.status === "open" && p.leaveAt > now);
    if (alive) return;
    const q = quoteParkingReceipt(mall, 620, now);
    const base = { mallId: mall.id, mallName: mall.name, verifiedOnSite: true, status: "open" as const, interests: [], viewCount: 0, autoAccept: false, demo: true };
    const posts: Post[] = [
      { ...base, id: uid("p"), scenario: "parking", direction: "have", shop: "停車場", fields: { receiptAmount: 620, hours: q.hours || 2 }, price: q.suggestMax != null ? Math.max(5, q.suggestMax - 5) : 15, payMethods: ["cash", "payme"], leaveAt: now + 25 * MIN, createdAt: now - 3 * MIN, authorId: "demo-ming", authorName: "阿明", pushedCount: 34 },
      { ...base, id: uid("p"), scenario: "dining", direction: "have", shop: "鼎泰豐", fields: { queueNo: "A038", partySize: 2, calling: "A021" }, price: 20, payMethods: ["cash", "fps"], leaveAt: now + 30 * MIN, createdAt: now - 6 * MIN, authorId: "demo-karen", authorName: "Karen", pushedCount: 41 },
      { ...base, id: uid("p"), scenario: "groupbuy", direction: "join", shop: "Nike", fields: { deal: "第二件半價", note: "波鞋" }, price: null, payMethods: [], leaveAt: now + 40 * MIN, createdAt: now - 2 * MIN, authorId: "demo-shan", authorName: "小珊", pushedCount: 128, needCount: 1, pinnedUntil: now + 12 * MIN },
      { ...base, id: uid("p"), scenario: "offer", direction: "have", shop: "屈臣氏", fields: { title: "$50 現金券（今日到期）", faceValue: 50 }, price: 20, payMethods: ["cash", "payme", "octopus"], leaveAt: now + 20 * MIN, createdAt: now - 9 * MIN, authorId: "demo-ken", authorName: "Ken", pushedCount: 27 },
      { ...base, id: uid("p"), scenario: "parking", direction: "want", shop: "停車場", fields: { hours: 2 }, price: 15, payMethods: ["cash"], leaveAt: now + 15 * MIN, createdAt: now - 1 * MIN, authorId: "demo-chan", authorName: "陳生", pushedCount: 34 },
    ];
    set({ ...state, posts: [...posts, ...state.posts.filter((p) => !(p.demo && p.mallId === mall.id))] });
  },

  createPost(input: Omit<Post, "id" | "createdAt" | "authorId" | "authorName" | "status" | "interests" | "viewCount">) {
    const post: Post = {
      ...input,
      id: uid("p"),
      createdAt: Date.now(),
      authorId: state.user.id,
      authorName: displayName(state.user),
      status: "open",
      interests: [],
      viewCount: 0,
    };
    set({ ...state, posts: [post, ...state.posts], user: { ...state.user, defaultPayMethods: input.payMethods.length ? input.payMethods : state.user.defaultPayMethods } });
    return post;
  },

  viewPost(id: string) {
    const p = state.posts.find((x) => x.id === id);
    if (!p || p.authorId === state.user.id) return;
    patchPost(id, (x) => ({ ...x, viewCount: x.viewCount + 1 }));
  },

  cancelPost(id: string) {
    patchPost(id, (p) => ({ ...p, status: "cancelled", pinnedUntil: undefined }));
  },

  extendPost(id: string, minutes: number) {
    patchPost(id, (p) => ({ ...p, status: p.status === "expired" ? "open" : p.status, leaveAt: Math.max(p.leaveAt, Date.now()) + minutes * MIN }));
  },

  expirePost(id: string) {
    patchPost(id, (p) => (p.status === "open" ? { ...p, status: "expired", pinnedUntil: undefined } : p));
  },

  pinPost(id: string, opts: { useCredit: boolean; extraPushed: number }) {
    const now = Date.now();
    patchPost(id, (p) => ({
      ...p,
      pinnedUntil: Math.min(Math.max(p.pinnedUntil ?? now, now) + PIN_MINUTES * MIN, p.leaveAt),
      pushedCount: p.pushedCount + opts.extraPushed,
    }));
    if (opts.useCredit) set({ ...state, user: { ...state.user, pinCredits: Math.max(0, state.user.pinCredits - 1) } });
  },

  /** 買家撳「有興趣」 */
  expressInterest(postId: string, text: string, offer?: number) {
    const me = state.user;
    const p = state.posts.find((x) => x.id === postId);
    if (!p || p.status !== "open") return;
    const existing = p.interests.find((i) => i.userId === me.id);
    const msg = { from: me.id, text, at: Date.now() };
    if (existing) {
      patchPost(postId, (x) => ({
        ...x,
        interests: x.interests.map((i) => (i.userId === me.id ? { ...i, offer: offer ?? i.offer, messages: [...i.messages, msg] } : i)),
      }));
    } else {
      const it: Interest = { userId: me.id, name: displayName(me), at: Date.now(), offer, messages: [msg], status: "pending" };
      patchPost(postId, (x) => ({ ...x, interests: [...x.interests, it] }));
    }
    const fresh = state.posts.find((x) => x.id === postId)!;
    if (fresh.autoAccept && !existing) {
      return local.acceptInterest(postId, me.id);
    }
    // 示範：其他用戶嘅 post，賣家一陣就會覆
    if (fresh.demo && !existing) {
      setTimeout(() => {
        const cur = state.posts.find((x) => x.id === postId);
        if (!cur || cur.status !== "open") return;
        patchPost(postId, (x) => ({
          ...x,
          interests: x.interests.map((i) =>
            i.userId === me.id ? { ...i, messages: [...i.messages, { from: x.authorId, text: offer != null ? `OK，$${offer} 得` : SCENARIOS[x.scenario].id === "groupbuy" ? "好呀，一齊夾" : "仲喺度，嚟啦", at: Date.now() }] } : i,
          ),
        }));
        local.acceptInterest(postId, me.id, offer);
      }, 1800);
    }
    return undefined;
  },

  /** 賣家喺「有興趣」名單揀人 */
  acceptInterest(postId: string, userId: string, agreedPrice?: number): string | undefined {
    const p = state.posts.find((x) => x.id === postId);
    if (!p) return;
    const it = p.interests.find((i) => i.userId === userId);
    if (!it) return;
    const scen = SCENARIOS[p.scenario];
    const now = Date.now();
    const price = agreedPrice ?? it.offer ?? p.price;

    let match = p.matchId ? state.matches.find((m) => m.id === p.matchId) : undefined;
    if (match && p.scenario === "groupbuy") {
      // 夾單：加人入同一個配對
      const updated: Match = {
        ...match,
        participants: [...match.participants, { userId, name: it.name }],
        messages: [...match.messages, sysMsg(`${it.name} 加入咗夾單`)],
        confirmedBy: match.confirmedBy.filter((id) => id === p.authorId),
      };
      set({ ...state, matches: state.matches.map((m) => (m.id === match!.id ? updated : m)) });
    } else {
      const authorName = p.authorName;
      match = {
        id: uid("m"),
        postId: p.id,
        scenario: p.scenario,
        mallId: p.mallId,
        mallName: p.mallName,
        shop: p.shop,
        price,
        payMethods: p.payMethods,
        authorId: p.authorId,
        participants: [
          { userId: p.authorId, name: authorName },
          { userId, name: it.name },
        ],
        meetPlace: p.scenario === "dining" ? `${p.shop}門口` : p.scenario === "parking" ? scen.meetPlaces[0] : `${p.shop}門口`,
        meetAt: Math.min(now + 5 * MIN, p.leaveAt),
        confirmedBy: [],
        arrived: {},
        outfits: {},
        messages: [sysMsg("配對成功！確認見面地點同時間，到咗撳「我到咗」。")],
        status: "active",
        createdAt: now,
      };
      set({ ...state, matches: [match, ...state.matches] });
    }

    const joined = (state.matches.find((m) => m.id === match!.id)?.participants.length ?? 2) - 1;
    const full = p.scenario !== "groupbuy" || joined >= (p.needCount ?? 1);
    patchPost(postId, (x) => ({
      ...x,
      matchId: match!.id,
      status: full ? "matched" : "open",
      pinnedUntil: full ? undefined : x.pinnedUntil,
      interests: x.interests.map((i) =>
        i.userId === userId
          ? { ...i, status: "accepted" }
          : full && i.status === "pending"
            ? { ...i, status: "declined", messages: [...i.messages, { from: x.authorId, text: "唔好意思，已經俾咗人", at: Date.now() }] }
            : i,
      ),
    }));

    // 示範：對方預設已經揀好衫
    const m2 = state.matches.find((m) => m.id === match!.id)!;
    const outfits = { ...m2.outfits };
    for (const part of m2.participants) {
      if (part.userId.startsWith("demo-")) {
        outfits[part.userId] = demoPerson(part.userId).outfit;
      }
    }
    patchMatch(m2.id, (m) => ({ ...m, outfits }));
    return match.id;
  },

  declineInterest(postId: string, userId: string) {
    patchPost(postId, (x) => ({
      ...x,
      interests: x.interests.map((i) =>
        i.userId === userId ? { ...i, status: "declined", messages: [...i.messages, { from: x.authorId, text: "唔好意思，已經俾咗人", at: Date.now() }] } : i,
      ),
    }));
  },

  /* ---------- 配對 ---------- */

  confirmMeet(matchId: string) {
    const me = state.user.id;
    patchMatch(matchId, (m) => ({ ...m, confirmedBy: m.confirmedBy.includes(me) ? m.confirmedBy : [...m.confirmedBy, me] }));
    // 示範：對方即刻確認
    const m = state.matches.find((x) => x.id === matchId);
    if (m) {
      const demoIds = m.participants.filter((p) => p.userId.startsWith("demo-")).map((p) => p.userId);
      if (demoIds.length) patchMatch(matchId, (x) => ({ ...x, confirmedBy: Array.from(new Set([...x.confirmedBy, ...demoIds])) }));
    }
  },

  changeMeet(matchId: string, place: string, at: number) {
    const me = state.user.id;
    patchMatch(matchId, (m) => ({
      ...m,
      meetPlace: place,
      meetAt: at,
      askedArrival: false,
      confirmedBy: [me],
      messages: [...m.messages, sysMsg(`見面改咗：${place}・${new Date(at).toLocaleTimeString("zh-HK", { hour: "numeric", minute: "2-digit" })}`)],
    }));
  },

  sendMessage(matchId: string, text: string, from = state.user.id) {
    patchMatch(matchId, (m) => ({ ...m, messages: [...m.messages, { id: uid("msg"), from, text, at: Date.now() }] }));
  },

  setOutfitToday(outfit: Outfit, matchId?: string) {
    set({ ...state, user: { ...state.user, outfitToday: { date: todayKey(), outfit } } });
    if (matchId) patchMatch(matchId, (m) => ({ ...m, outfits: { ...m.outfits, [state.user.id]: outfit } }));
  },

  arrive(matchId: string, userId = state.user.id) {
    const m0 = state.matches.find((m) => m.id === matchId);
    if (!m0 || m0.status !== "active") return;
    const name = m0.participants.find((p) => p.userId === userId)?.name ?? "對方";
    patchMatch(matchId, (m) => ({
      ...m,
      arrived: { ...m.arrived, [userId]: Date.now() },
      messages: [...m.messages, { id: uid("msg"), from: userId, text: "我到咗", at: Date.now() }, ...(userId === state.user.id ? [] : [sysMsg(`${name} 已經到咗`)])],
    }));
    const m = state.matches.find((x) => x.id === matchId)!;
    if (m.participants.every((p) => m.arrived[p.userId])) local.completeMatch(matchId);
  },

  completeMatch(matchId: string) {
    const m = state.matches.find((x) => x.id === matchId);
    if (!m || m.status !== "active") return;
    const me = state.user;
    const isAuthor = m.authorId === me.id;
    const pts = m.scenario === "groupbuy" ? POINTS.groupbuy : isAuthor && m.price != null ? POINTS.giver : POINTS.taker;
    const partner = m.participants.find((p) => p.userId !== me.id)?.userId ?? "";
    const earn = canEarnPoints(me, partner, pts);
    patchMatch(matchId, (x) => ({
      ...x,
      status: "completed",
      endedAt: Date.now(),
      messages: [...x.messages, sysMsg(earn > 0 ? `完成！你儲到 ${earn} 分。` : "完成！（同一對人一星期內重複交易唔再計分）")],
    }));
    set({
      ...state,
      user: {
        ...state.user,
        completed: state.user.completed + 1,
        points: state.user.points + earn,
        lifetimePoints: state.user.lifetimePoints + earn,
        pointLog: [...state.user.pointLog, { at: Date.now(), partnerId: partner, pts: earn }],
      },
    });
  },

  cancelMatch(matchId: string, reason: string) {
    const m = state.matches.find((x) => x.id === matchId);
    if (!m) return;
    const me = state.user.id;
    const now = Date.now();
    // 臨時取消：對方已經到咗，自己未到
    const late = !m.arrived[me] && m.participants.some((p) => p.userId !== me && m.arrived[p.userId]);
    const msgs = [{ id: uid("msg"), from: me, text: reason, at: now }];
    if (late) {
      const log = [...(state.user.lateCancelLog ?? []), now].filter((t) => now - t < 30 * DAY);
      const ded = Math.min(30, state.user.points);
      const banned = log.length >= 2;
      msgs.push(sysMsg(`${displayName(state.user)} 喺對方到咗之後取消，記一次臨時取消。已經到咗嘅人補償 20 分。`));
      if (banned) msgs.push(sysMsg(`${displayName(state.user)} 30 日內第二次臨時取消，帳戶停用一個月。`));
      set({
        ...state,
        user: {
          ...state.user,
          points: state.user.points - ded,
          lateCancelLog: log,
          lateCancels30d: log.length,
          ...(banned ? { bannedUntil: now + BAN_DAYS * DAY, noShows: state.user.noShows + 1 } : {}),
        },
      });
    } else {
      msgs.push(sysMsg("配對已取消。對方未到之前取消唔會被罰。"));
    }
    patchMatch(matchId, (x) => ({ ...x, status: "cancelled", endedAt: now, cancelledBy: me, lateCancel: late, messages: [...x.messages, ...msgs] }));
    const iAmAuthor = m.authorId === me;
    patchPost(m.postId, (p) => {
      // 出 post 嘅人臨時取消：post 唔再重新開放
      if (late && iAmAuthor) return { ...p, status: "cancelled", matchId: undefined, pinnedUntil: undefined };
      if (p.leaveAt <= now) return p;
      return iAmAuthor
        ? { ...p, status: "open", matchId: undefined, interests: p.interests.map((i) => (i.status === "accepted" ? { ...i, status: "declined" as const } : i)) }
        : { ...p, status: "open", matchId: undefined, interests: p.interests.filter((i) => i.userId !== me) };
    });
  },

  /** 有人冇出現。accusedId 係我自己就停用一個月 */
  reportNoShow(matchId: string, accusedId: string) {
    patchMatch(matchId, (m) => ({ ...m, status: "noshow", endedAt: Date.now(), messages: [...m.messages, sysMsg(accusedId === state.user.id ? "對方報告你冇出現，帳戶停用一個月。可以喺 48 小時內申訴。" : "已記錄對方冇出現，對方帳戶會停用一個月。")] }));
    if (accusedId === state.user.id) {
      set({ ...state, user: { ...state.user, noShows: state.user.noShows + 1, bannedUntil: Date.now() + BAN_DAYS * DAY, points: Math.max(0, state.user.points - POINTS.noShowPenalty) } });
    }
  },

  rateMatch(matchId: string, rating: "up" | "down") {
    patchMatch(matchId, (m) => ({ ...m, rated: rating }));
  },

  markRatePrompt(matchId: string) {
    patchMatch(matchId, (m) => ({ ...m, ratePromptShown: true }));
  },

  markAskedArrival(matchId: string) {
    patchMatch(matchId, (m) => ({ ...m, askedArrival: true }));
  },

  submitAppeal(text: string) {
    set({ ...state, user: { ...state.user, appeal: { text, at: Date.now(), status: "pending" } } });
  },

  redeemPin() {
    if (state.user.points < POINTS.pinCost) return false;
    set({ ...state, user: { ...state.user, points: state.user.points - POINTS.pinCost, pinCredits: state.user.pinCredits + 1 } });
    return true;
  },

  requestVoucher() {
    if (state.user.points < POINTS.voucherCost) return false;
    set({ ...state, user: { ...state.user, points: state.user.points - POINTS.voucherCost, voucherRequests: [...state.user.voucherRequests, { at: Date.now(), status: "pending" }] } });
    return true;
  },

  markArrivalShown(mallId: string) {
    set({ ...state, user: { ...state.user, arrivalShown: { ...state.user.arrivalShown, [`${mallId}|${todayKey()}`]: true } } });
  },

  /* ---------- 示範控制 ---------- */

  demoSomeoneInterested(postId: string) {
    const p = state.posts.find((x) => x.id === postId);
    if (!p) return;
    const used = new Set(p.interests.map((i) => i.userId));
    const person = DEMO_PEOPLE.find((d) => !used.has(d.id));
    if (!person) return;
    const it: Interest = {
      userId: person.id,
      name: person.name,
      at: Date.now(),
      offer: p.price != null && p.price > 10 ? p.price - 5 : undefined,
      messages: [
        { from: person.id, text: "有興趣", at: Date.now() },
        ...(p.price != null && p.price > 10 ? [{ from: person.id, text: `$${p.price - 5} 得唔得？`, at: Date.now() }] : [{ from: person.id, text: "你仲喺唔喺附近？", at: Date.now() }]),
      ],
      status: "pending",
    };
    patchPost(postId, (x) => ({ ...x, interests: [...x.interests, it], viewCount: x.viewCount + 1 }));
    if (p.autoAccept) local.acceptInterest(postId, person.id);
  },

  demoPartnerArrives(matchId: string) {
    const m = state.matches.find((x) => x.id === matchId);
    if (!m) return;
    for (const p of m.participants) if (p.userId !== state.user.id && !m.arrived[p.userId]) local.arrive(matchId, p.userId);
  },

  demoPartnerReportsMe(matchId: string) {
    local.reportNoShow(matchId, state.user.id);
  },
};


/* ================= 模式切換 ================= */

export type AahMode = "detecting" | "local" | "remote";
let mode: AahMode = "detecting";
let settings: RemoteSettings = { allowTestLocation: true, enforceGps: false, freePinTrial: true };
let remote: Remote | null = null;
let modeListeners: Array<() => void> = [];
const PREFS_KEY = "aah:prefs";
const baseUser: User = { ...freshUser(), id: state.user.id };

function loadPrefs(): LocalPrefs {
  const fromState: LocalPrefs = {
    onboarded: state.user.onboarded,
    testMallId: state.user.testMallId ?? null,
    arrivalShown: state.user.arrivalShown ?? {},
    outfitToday: state.user.outfitToday,
    matchFlags: {},
  };
  if (typeof window === "undefined") return fromState;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (raw) return { ...fromState, ...JSON.parse(raw) };
  } catch {
    /* 用返預設 */
  }
  return fromState;
}
let prefs: LocalPrefs = loadPrefs();

function savePrefs(patch: Partial<LocalPrefs>) {
  prefs = { ...prefs, ...patch };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* 寫唔到照用記憶體 */
    }
  }
}

function setMode(m: AahMode) {
  mode = m;
  modeListeners.forEach((l) => l());
}

async function init() {
  const s = await detectRemote();
  if (!s) {
    setMode("local");
    return;
  }
  settings = s;
  prefs = loadPrefs();
  remote = createRemote({
    get: () => state,
    set: (next) => {
      state = next;
      listeners.forEach((l) => l());
    },
    prefs: () => prefs,
    baseUser: () => baseUser,
  });
  // 先清走示範資料，再由雲端載入
  state = { user: { ...baseUser, ...prefsUser(), registered: false }, posts: [], matches: [] };
  setMode("remote");
  listeners.forEach((l) => l());
  await remote.start();
}

function prefsUser(): Partial<User> {
  return { onboarded: prefs.onboarded, testMallId: prefs.testMallId, arrivalShown: prefs.arrivalShown, outfitToday: prefs.outfitToday };
}

function patchUserLocal(patch: Partial<User>) {
  state = { ...state, user: { ...state.user, ...patch } };
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") setTimeout(() => void init(), 0);

export function getMode() {
  return mode;
}
export function getSettings() {
  return settings;
}
export function useAahMode() {
  return useSyncExternalStore(
    (fn) => {
      modeListeners.push(fn);
      return () => {
        modeListeners = modeListeners.filter((l) => l !== fn);
      };
    },
    () => mode,
    () => mode,
  );
}

const PREF_KEYS = ["onboarded", "testMallId", "arrivalShown", "outfitToday"] as const;
const R = () => remote!;
const isRemote = () => mode === "remote" && !!remote;

/** 畫面用嘅 action（兩個模式一樣） */
export const aah = {
  get: () => state,
  subscribe: (fn: () => void) => local.subscribe(fn),

  updateUser(patch: Partial<User>) {
    if (!isRemote()) return local.updateUser(patch);
    const prefPatch: Partial<LocalPrefs> = {};
    for (const k of PREF_KEYS) if (k in patch) (prefPatch as any)[k] = (patch as any)[k];
    if (Object.keys(prefPatch).length) savePrefs(prefPatch);
    patchUserLocal(patch);
    void R().updateProfile(patch).catch((e) => console.warn("[aah] updateProfile", e));
  },

  /** Email 註冊（示範模式唔會真係建立帳戶） */
  async signUpEmail(email: string, password: string, nickname: string, phone?: string): Promise<"done" | "confirm"> {
    if (!isRemote()) {
      local.register(phone || email, nickname);
      patchUserLocal({ email });
      return "done";
    }
    return R().signUpEmail(email, password, nickname, phone);
  },
  async signInEmail(email: string, password: string): Promise<"done" | "need_profile"> {
    if (!isRemote()) return state.user.registered ? "done" : "need_profile";
    return R().signInEmail(email, password);
  },
  async resetPassword(email: string) {
    if (isRemote()) await R().resetPassword(email);
  },
  async signOut() {
    if (isRemote()) await R().signOut();
  },
  async completeRegistration(phone: string | null, nickname: string) {
    if (!isRemote()) return local.register(phone ?? "", nickname);
    await R().completeRegistration(phone, nickname);
  },

  resetDemo() {
    if (!isRemote()) return local.resetDemo();
    savePrefs({ arrivalShown: {}, matchFlags: {}, outfitToday: undefined });
    patchUserLocal({ arrivalShown: {}, outfitToday: undefined });
  },

  ensureDemoPosts(mall: AahMall) {
    if (!isRemote() && mode === "local") local.ensureDemoPosts(mall);
  },
  setFeedMalls(ids: string[]) {
    if (isRemote()) R().setFeedMalls(ids);
  },
  touchPresence(mallId: string) {
    if (isRemote()) void R().touchPresence(mallId).catch(() => {});
  },

  async createPost(input: Parameters<typeof local.createPost>[0]): Promise<Post> {
    return isRemote() ? R().createPost(input) : local.createPost(input);
  },
  viewPost(id: string) {
    if (isRemote()) void R().viewPost(id).catch(() => {});
    else local.viewPost(id);
  },
  async cancelPost(id: string) {
    return isRemote() ? R().cancelPost(id) : local.cancelPost(id);
  },
  async extendPost(id: string, minutes: number) {
    return isRemote() ? R().extendPost(id, minutes) : local.extendPost(id, minutes);
  },
  async expirePost(id: string) {
    return isRemote() ? R().expirePost(id) : local.expirePost(id);
  },
  async pinPost(id: string, opts: { useCredit: boolean; extraPushed: number }) {
    return isRemote() ? R().pinPost(id, opts.useCredit) : local.pinPost(id, opts);
  },

  async expressInterest(postId: string, text: string, offer?: number): Promise<string | undefined> {
    return isRemote() ? R().expressInterest(postId, text, offer) : local.expressInterest(postId, text, offer);
  },
  async acceptInterest(postId: string, userId: string, price?: number): Promise<string | undefined> {
    return isRemote() ? R().acceptInterest(postId, userId, price) : local.acceptInterest(postId, userId, price);
  },
  async declineInterest(postId: string, userId: string) {
    return isRemote() ? R().declineInterest(postId, userId) : local.declineInterest(postId, userId);
  },

  async confirmMeet(matchId: string) {
    return isRemote() ? R().confirmMeet(matchId) : local.confirmMeet(matchId);
  },
  async changeMeet(matchId: string, place: string, at: number) {
    return isRemote() ? R().changeMeet(matchId, place, at) : local.changeMeet(matchId, place, at);
  },
  async sendMessage(matchId: string, text: string) {
    return isRemote() ? R().sendMessage(matchId, text) : local.sendMessage(matchId, text);
  },
  async setOutfitToday(outfit: Outfit, matchId?: string) {
    if (!isRemote()) return local.setOutfitToday(outfit, matchId);
    const outfitToday = { date: todayKey(), outfit };
    savePrefs({ outfitToday });
    patchUserLocal({ outfitToday });
    if (matchId) await R().setOutfit(matchId, outfit);
  },

  /** 我到咗（或者確認對方到咗）。回傳 completed = 全部人到齊、已完成 */
  async arrive(matchId: string, opts: { userId?: string; coords?: { lat: number; lng: number } } = {}): Promise<"completed" | "waiting"> {
    const me = state.user.id;
    if (isRemote()) {
      return opts.userId && opts.userId !== me ? R().confirmPartnerMet(matchId, opts.userId) : R().arrive(matchId, opts.coords);
    }
    local.arrive(matchId, opts.userId ?? me);
    return state.matches.find((m) => m.id === matchId)?.status === "completed" ? "completed" : "waiting";
  },
  async cancelMatch(matchId: string, reason: string) {
    return isRemote() ? R().cancelMatch(matchId, reason) : local.cancelMatch(matchId, reason);
  },
  async reportNoShow(matchId: string, accusedId: string) {
    return isRemote() ? R().reportNoShow(matchId, accusedId) : local.reportNoShow(matchId, accusedId);
  },
  async report(matchId: string, accusedId: string, kind: string, note: string) {
    if (isRemote()) {
      await R().report(matchId, accusedId, kind, note);
      await R().cancelMatch(matchId, "（已舉報並封鎖）").catch(() => {});
      return;
    }
    local.cancelMatch(matchId, "（已舉報並封鎖）");
  },
  async rateMatch(matchId: string, rating: "up" | "down") {
    return isRemote() ? R().rateMatch(matchId, rating) : local.rateMatch(matchId, rating);
  },
  markRatePrompt(matchId: string) {
    if (!isRemote()) return local.markRatePrompt(matchId);
    savePrefs({ matchFlags: { ...prefs.matchFlags, [matchId]: { ...prefs.matchFlags[matchId], ratePromptShown: true } } });
    state = { ...state, matches: state.matches.map((m) => (m.id === matchId ? { ...m, ratePromptShown: true } : m)) };
    listeners.forEach((l) => l());
  },
  markAskedArrival(matchId: string) {
    if (!isRemote()) return local.markAskedArrival(matchId);
    savePrefs({ matchFlags: { ...prefs.matchFlags, [matchId]: { ...prefs.matchFlags[matchId], askedArrival: true } } });
  },

  async submitAppeal(text: string) {
    return isRemote() ? R().submitAppeal(text) : local.submitAppeal(text);
  },
  async redeemPin() {
    if (isRemote()) return R().redeemPin();
    if (!local.redeemPin()) throw new Error("not enough points");
  },
  async requestVoucher() {
    if (isRemote()) return R().requestVoucher();
    if (!local.requestVoucher()) throw new Error("not enough points");
  },
  markArrivalShown(mallId: string) {
    if (!isRemote()) return local.markArrivalShown(mallId);
    const arrivalShown = { ...prefs.arrivalShown, [`${mallId}|${todayKey()}`]: true as const };
    savePrefs({ arrivalShown });
    patchUserLocal({ arrivalShown });
  },

  // 示範控制（只喺示範模式）
  demoSomeoneInterested: (postId: string) => local.demoSomeoneInterested(postId),
  demoPartnerArrives: (matchId: string) => local.demoPartnerArrives(matchId),
  demoPartnerReportsMe: (matchId: string) => local.demoPartnerReportsMe(matchId),
};

export { aahErrorText } from "./remote";

/** 回傳成個 state（參照穩定）；要篩選就喺 component 用 useMemo */
export function useAahState() {
  return useSyncExternalStore(aah.subscribe, aah.get, aah.get);
}

export function dailyDiningCount(posts: Post[], userId: string) {
  const today = todayKey();
  return posts.filter((p) => p.authorId === userId && p.scenario === "dining" && todayKey(p.createdAt) === today).length;
}

export function pinnedCountInMall(posts: Post[], mallId: string, now = Date.now()) {
  return posts.filter((p) => p.mallId === mallId && p.status === "open" && (p.pinnedUntil ?? 0) > now).length;
}

export function nextPinFreeAt(posts: Post[], mallId: string, now = Date.now()) {
  const ends = posts.filter((p) => p.mallId === mallId && p.status === "open" && (p.pinnedUntil ?? 0) > now).map((p) => p.pinnedUntil!);
  return ends.length ? Math.min(...ends) : now;
}
