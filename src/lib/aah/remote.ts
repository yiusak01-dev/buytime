import { supabase } from "@/integrations/supabase/client";
import { removeThisDevice } from "./push";
import type { Interest, Match, Outfit, Post, User } from "./types";

/**
 * 雲端模式：所有 post、配對、傾偈存喺 Supabase（aah_* 資料表），
 * 用 realtime 同步，兩部電話之間即時見到。
 * 狀態變更全部經 security definer function（見 supabase/migrations/20261025*）。
 */

const sb = () => supabase as any;

export type RemoteSettings = { allowTestLocation: boolean; enforceGps: boolean; freePinTrial: boolean };

export type LocalPrefs = {
  onboarded: boolean;
  testMallId: string | null;
  arrivalShown: Record<string, true>;
  outfitToday?: { date: string; outfit: Outfit };
  matchFlags: Record<string, { ratePromptShown?: boolean; askedArrival?: boolean }>;
};

type State = { user: User; posts: Post[]; matches: Match[] };

type Host = {
  get: () => State;
  set: (s: State) => void;
  prefs: () => LocalPrefs;
  baseUser: () => User;
};

const ts = (iso?: string | null) => (iso ? Date.parse(iso) : undefined);

/** 偵測雲端資料表係咪已經開咗 */
export async function detectRemote(): Promise<RemoteSettings | null> {
  try {
    const { data, error } = await sb().from("aah_settings").select("key,value");
    if (error) return null;
    const map = new Map<string, unknown>((data ?? []).map((r: any) => [r.key, r.value]));
    return {
      allowTestLocation: map.get("allow_test_location") !== false,
      enforceGps: map.get("enforce_gps") === true,
      freePinTrial: map.get("free_pin_trial") !== false,
    };
  } catch {
    return null;
  }
}

export function createRemote(host: Host) {
  let uid: string | null = null;
  let feedMalls: string[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inflight: Promise<void> | null = null;
  let inflightSince = 0;
  let again = false;
  let channel: any = null;
  let channelUid: string | null | undefined = undefined;
  let realtimeOk = false;
  let lastRefresh = 0;
  let lastPresence = 0;

  async function refreshNow() {
    const { data: sess } = await sb().auth.getSession();
    uid = sess?.session?.user?.id ?? null;
    const me = uid;
    const prefs = host.prefs();
    const base = host.baseUser();
    const email: string | undefined = sess?.session?.user?.email ?? undefined;

    // 三組資料互不依賴，一齊攞（伺服器喺悉尼，逐個等會慢成兩秒）
    const [user, posts, matches] = await Promise.all([loadUser(me, base, prefs, email), loadPosts(me), loadMatches(me, prefs)]);
    host.set({ user, posts, matches });
  }

  async function loadUser(me: string | null, base: User, prefs: ReturnType<typeof host.prefs>, email: string | undefined): Promise<User> {
    let user: User = { ...base, ...prefsToUser(prefs), id: me ?? base.id, registered: false, email, signedIn: !!me };
    if (!me) return user;
    // email 確認完返嚟登入：用註冊時填嘅暱稱自動建立 profile
    const pending = readPending();
    if (pending) {
      const { data: exists } = await sb().from("aah_profiles").select("id").eq("id", me).maybeSingle();
      if (!exists) {
        const { error } = await sb().from("aah_profiles").insert({ id: me, nickname: pending.nickname, phone: pending.phone || null });
        if (!error) clearPending();
      } else clearPending();
    }
    const [{ data: prof }, { data: appeal }, { data: vouchers }, { count: lateCount }] = await Promise.all([
      sb().from("aah_profiles").select("*").eq("id", me).maybeSingle(),
      sb().from("aah_appeals").select("text, status, created_at").eq("user_id", me).order("created_at", { ascending: false }).limit(1),
      sb().from("aah_voucher_requests").select("status, created_at").eq("user_id", me).eq("status", "pending"),
      sb()
        .from("aah_point_ledger")
        .select("id", { count: "exact", head: true })
        .eq("user_id", me)
        .eq("reason", "late_cancel")
        .gt("created_at", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()),
    ]);
    if (prof) {
      user = {
        ...user,
        registered: true,
        phone: prof.phone ?? undefined,
        nickname: prof.nickname ?? undefined,
        registeredAt: ts(prof.created_at),
        points: prof.points,
        lifetimePoints: prof.lifetime_points,
        completed: prof.completed,
        noShows: prof.no_shows,
        bannedUntil: ts(prof.banned_until),
        notifyCats: prof.notify_cats ?? user.notifyCats,
        notifyOpportunities: prof.notify_opportunities,
        notifyPromotions: prof.notify_promotions,
        defaultPayMethods: prof.default_pay_methods ?? user.defaultPayMethods,
        pinCredits: prof.pin_credits,
        appeal: appeal?.[0] ? { text: appeal[0].text, at: Date.parse(appeal[0].created_at), status: appeal[0].status } : undefined,
        voucherRequests: (vouchers ?? []).map((v: any) => ({ at: Date.parse(v.created_at), status: "pending" as const })),
        lateCancels30d: lateCount ?? 0,
      };
    }
    return user;
  }

  // Post：商場 feed + 我出嘅 + 我有興趣嘅
  async function loadPosts(me: string | null): Promise<Post[]> {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const queries: Promise<any>[] = [];
    if (feedMalls.length) {
      queries.push(
        sb().from("aah_posts").select("*").in("mall_id", feedMalls).eq("status", "open").gt("leave_at", new Date(Date.now() - 60000).toISOString()).order("created_at", { ascending: false }).limit(200),
      );
    }
    if (me) {
      queries.push(sb().from("aah_posts").select("*").eq("author_id", me).gt("created_at", since).order("created_at", { ascending: false }).limit(50));
      // 我有興趣嘅 post：用 embed 一次過攞，唔使先攞 id 再攞 post
      queries.push(
        sb()
          .from("aah_interests")
          .select("post:aah_posts(*)")
          .eq("user_id", me)
          .gt("created_at", since)
          .then((r: any) => ({ data: (r.data ?? []).map((x: any) => x.post).filter(Boolean) })),
      );
    }
    const results = await Promise.all(queries);
    const postRows = new Map<string, any>();
    for (const r of results) for (const row of r.data ?? []) postRows.set(row.id, row);

    const postIds = [...postRows.keys()];
    let interests: any[] = [];
    let imsgs: any[] = [];
    if (postIds.length && me) {
      // 興趣同佢哋嘅訊息一次過攞（RLS 照樣過濾）
      const { data } = await sb().from("aah_interests").select("*, msgs:aah_interest_messages(*)").in("post_id", postIds);
      interests = (data ?? []).map(({ msgs, ...i }: any) => i);
      imsgs = (data ?? []).flatMap((i: any) => i.msgs ?? []).sort((a: any, b: any) => Date.parse(a.created_at) - Date.parse(b.created_at));
    }
    return [...postRows.values()].map((r) => rowToPost(r, interests, imsgs)).sort((a, b) => b.createdAt - a.createdAt);
  }

  // 配對（RLS 只會俾返我有份嘅）；參與者同訊息一次過攞
  async function loadMatches(me: string | null, prefs: ReturnType<typeof host.prefs>): Promise<Match[]> {
    if (!me) return [];
    const { data: mrows } = await sb()
      .from("aah_matches")
      .select("*, parts:aah_match_participants(*), msgs:aah_messages(*)")
      .gt("created_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
      .order("created_at", { ascending: false });
    const rows = mrows ?? [];
    const parts = rows.flatMap((m: any) => m.parts ?? []);
    const msgs = rows.flatMap((m: any) => m.msgs ?? []).sort((a: any, b: any) => Date.parse(a.created_at) - Date.parse(b.created_at));
    return rows.map(({ parts: _p, msgs: _m, ...m }: any) => rowToMatch(m, parts, msgs, me, prefs));
  }

  async function refresh() {
    // 保險：如果上一次同步卡住超過 15 秒，放棄佢重新嚟過
    if (inflight && Date.now() - inflightSince > 15000) inflight = null;
    if (inflight) {
      again = true;
      return inflight;
    }
    inflightSince = Date.now();
    inflight = (async () => {
      try {
        await refreshNow();
        lastRefresh = Date.now();
      } catch (e) {
        console.warn("[aah] refresh failed", e);
      } finally {
        inflight = null;
        if (again) {
          again = false;
          void refresh();
        }
      }
    })();
    return inflight;
  }

  /** 等一次喺「而家之後」先開始嘅同步（如果有舊嗰次跑緊，等佢完再嚟過），最多等 4 秒 */
  async function refreshFresh() {
    const run = (async () => {
      if (inflight) await inflight.catch(() => {});
      await refresh();
    })();
    await Promise.race([run, new Promise((r) => setTimeout(r, 4000))]);
  }

  function scheduleRefresh() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void refresh(), 250);
  }

  function subscribe() {
    // 同一個用戶唔使重新訂閱（token 每個鐘更新一次都會觸發 onAuthStateChange）
    if (channel && channelUid === uid) return;
    if (channel) sb().removeChannel(channel);
    realtimeOk = false;
    channelUid = uid;
    const ch = sb().channel(`aah-${uid ?? "anon"}-${Date.now()}`);
    channel = ch;
    for (const table of ["aah_posts", "aah_interests", "aah_interest_messages", "aah_matches", "aah_match_participants", "aah_messages", "aah_profiles"]) {
      ch.on("postgres_changes", { event: "*", schema: "public", table }, scheduleRefresh);
    }
    // 任何一個 table 冇開 realtime，Supabase 會令成個 channel 失效，但 subscribe 狀態仍然係 SUBSCRIBED，
    // 所以要聽 system 訊息先知；失效時改為每 5 秒同步
    ch.on("system", {}, (msg: any) => {
      if (channel !== ch || msg?.extension !== "postgres_changes") return;
      realtimeOk = msg.status === "ok";
      if (!realtimeOk) console.warn("[aah] realtime unavailable, polling every 5s:", msg?.message);
    });
    ch.subscribe((status: string, err?: unknown) => {
      if (channel !== ch) return;
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        realtimeOk = false;
        if (status !== "CLOSED") console.warn("[aah] realtime", status, err);
      }
    });
  }

  async function start() {
    await refresh();
    subscribe();
    // 注意：唔可以喺 onAuthStateChange 入面直接 call Supabase（會鎖死登入流程，之後唔再更新），要遲一拍先做
    sb().auth.onAuthStateChange(() => {
      setTimeout(() => {
        void refresh().then(subscribe);
      }, 0);
    });
    // 後備同步：realtime 正常就每 20 秒一次；realtime 斷咗就每 5 秒一次
    setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const every = realtimeOk ? 20000 : 5000;
      if (Date.now() - lastRefresh >= every - 500) void refresh();
    }, 5000);
    // 由背景返嚟即刻同步一次
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void refresh();
      });
    }
  }

  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await sb().rpc(name, args);
    if (error) throw error;
    // 等最新狀態返到嚟先完成，撳完個掣畫面即刻反映結果
    await refreshFresh();
    return data;
  }

  function interestId(postId: string, userId: string) {
    const p = host.get().posts.find((x) => x.id === postId);
    const id = p?.interests.find((i) => i.userId === userId)?.id;
    if (!id) throw new Error("interest not found");
    return id;
  }

  return {
    start,
    refresh,
    get uid() {
      return uid;
    },

    setFeedMalls(ids: string[]) {
      const next = [...new Set(ids)].sort();
      if (next.join() === feedMalls.join()) return;
      feedMalls = next;
      scheduleRefresh();
    },

    async touchPresence(mallId: string) {
      if (!uid || Date.now() - lastPresence < 3 * 60000) return;
      lastPresence = Date.now();
      await sb().rpc("aah_touch_presence", { p_mall: mallId });
    },

    /** Email 註冊。Supabase 開咗 email 確認，就要先撳 email 連結再登入 */
    async signUpEmail(email: string, password: string, nickname: string, phone?: string): Promise<"done" | "confirm"> {
      const { data, error } = await sb().auth.signUp({
        email,
        password,
        options: { data: { name: nickname }, emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
      });
      if (error) throw error;
      // 已經註冊過嘅 email，Supabase 會回傳冇 identities 嘅 user
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error("User already registered");
      if (data.session) {
        await this.completeRegistration(phone ?? null, nickname);
        return "done";
      }
      savePending({ nickname, phone: phone ?? null });
      return "confirm";
    },

    async signInEmail(email: string, password: string): Promise<"done" | "need_profile"> {
      const { error } = await sb().auth.signInWithPassword({ email, password });
      if (error) throw error;
      await refresh();
      return host.get().user.registered ? "done" : "need_profile";
    },

    async resetPassword(email: string) {
      const { error } = await sb().auth.resetPasswordForEmail(email, {
        redirectTo: typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined,
      });
      if (error) throw error;
    },

    async signOut() {
      // 呢部裝置唔再收呢個帳戶嘅推送
      await removeThisDevice();
      await sb().auth.signOut();
      await refresh();
    },

    async completeRegistration(phone: string | null, nickname: string) {
      const { data: sess } = await sb().auth.getSession();
      const id = sess?.session?.user?.id;
      if (!id) throw new Error("not signed in");
      const { data: existing } = await sb().from("aah_profiles").select("id").eq("id", id).maybeSingle();
      if (existing) {
        const { error } = await sb().from("aah_profiles").update({ nickname }).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await sb().from("aah_profiles").insert({ id, phone: phone || null, nickname });
        if (error) throw error;
      }
      await refresh();
    },

    async updateProfile(patch: Partial<User>) {
      if (!uid) return;
      const row: Record<string, unknown> = {};
      if (patch.notifyCats) row.notify_cats = patch.notifyCats;
      if (patch.notifyOpportunities !== undefined) row.notify_opportunities = patch.notifyOpportunities;
      if (patch.notifyPromotions !== undefined) row.notify_promotions = patch.notifyPromotions;
      if (patch.defaultPayMethods) row.default_pay_methods = patch.defaultPayMethods;
      if (patch.nickname) row.nickname = patch.nickname;
      if (Object.keys(row).length === 0) return;
      const { error } = await sb().from("aah_profiles").update(row).eq("id", uid);
      if (error) throw error;
      scheduleRefresh();
    },

    async createPost(input: Omit<Post, "id" | "createdAt" | "authorId" | "authorName" | "status" | "interests" | "viewCount">): Promise<Post> {
      const id: string = await rpc("aah_create_post", {
        p: {
          scenario: input.scenario,
          direction: input.direction,
          mall_id: input.mallId,
          mall_name: input.mallName,
          shop: input.shop,
          fields: input.fields,
          price: input.price,
          pay_methods: input.payMethods,
          leave_at: new Date(input.leaveAt).toISOString(),
          verified_on_site: input.verifiedOnSite,
          auto_accept: input.autoAccept,
          need_count: input.needCount ?? null,
        },
      });
      if (input.payMethods.length) void this.updateProfile({ defaultPayMethods: input.payMethods }).catch(() => {});
      const p = host.get().posts.find((x) => x.id === id);
      return p ?? ({ ...input, id, createdAt: Date.now(), authorId: uid ?? "", authorName: "", status: "open", interests: [], viewCount: 0 } as Post);
    },

    async viewPost(id: string) {
      await sb().rpc("aah_view_post", { p_post: id });
    },

    async cancelPost(id: string) {
      const { error } = await sb().from("aah_posts").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
      scheduleRefresh();
    },

    async extendPost(id: string, minutes: number) {
      const p = host.get().posts.find((x) => x.id === id);
      const leave = Math.max(p?.leaveAt ?? Date.now(), Date.now()) + minutes * 60000;
      const { error } = await sb().from("aah_posts").update({ status: "open", leave_at: new Date(leave).toISOString() }).eq("id", id);
      if (error) throw error;
      scheduleRefresh();
    },

    async expirePost(id: string) {
      await sb().from("aah_posts").update({ status: "expired" }).eq("id", id).eq("status", "open");
      scheduleRefresh();
    },

    async pinPost(id: string, useCredit: boolean) {
      await rpc("aah_pin_post", { p_post: id, p_use_credit: useCredit });
    },

    async expressInterest(postId: string, text: string, offer?: number): Promise<string | undefined> {
      const matchId = await rpc("aah_express_interest", { p_post: postId, p_text: text, p_offer: offer ?? null });
      return matchId ?? undefined;
    },

    async acceptInterest(postId: string, userId: string, price?: number): Promise<string | undefined> {
      const id = await rpc("aah_accept_interest", { p_interest: interestId(postId, userId), p_price: price ?? null });
      return id ?? undefined;
    },

    async declineInterest(postId: string, userId: string) {
      await rpc("aah_decline_interest", { p_interest: interestId(postId, userId) });
    },

    async confirmMeet(matchId: string) {
      await rpc("aah_confirm_meet", { p_match: matchId });
    },

    async changeMeet(matchId: string, place: string, at: number) {
      await rpc("aah_change_meet", { p_match: matchId, p_place: place, p_at: new Date(at).toISOString() });
    },

    async sendMessage(matchId: string, text: string) {
      const { error } = await sb().from("aah_messages").insert({ match_id: matchId, from_id: uid, text });
      if (error) throw error;
      scheduleRefresh();
    },

    async setOutfit(matchId: string, outfit: Outfit) {
      const { error } = await sb().from("aah_match_participants").update({ outfit }).eq("match_id", matchId).eq("user_id", uid);
      if (error) throw error;
      scheduleRefresh();
    },

    async arrive(matchId: string, coords?: { lat: number; lng: number }) {
      const r = await rpc("aah_mark_arrived", { p_match: matchId, p_lat: coords?.lat ?? null, p_lng: coords?.lng ?? null });
      return r as "completed" | "waiting";
    },

    async confirmPartnerMet(matchId: string, userId: string) {
      const r = await rpc("aah_confirm_partner_met", { p_match: matchId, p_user: userId });
      return r as "completed" | "waiting";
    },

    async cancelMatch(matchId: string, reason: string) {
      await rpc("aah_cancel_match", { p_match: matchId, p_reason: reason });
    },

    async reportNoShow(matchId: string, accusedId: string) {
      await rpc("aah_report_no_show", { p_match: matchId, p_accused: accusedId });
    },

    async report(matchId: string, accusedId: string, kind: string, note: string) {
      const { error } = await sb().from("aah_reports").insert({ match_id: matchId, reporter_id: uid, accused_id: accusedId, kind, note });
      if (error) throw error;
    },

    async rateMatch(matchId: string, rating: "up" | "down") {
      await sb().from("aah_match_participants").update({ rating }).eq("match_id", matchId).eq("user_id", uid);
      scheduleRefresh();
    },

    async submitAppeal(text: string) {
      await rpc("aah_submit_appeal", { p_text: text });
    },

    async redeemPin() {
      await rpc("aah_redeem_pin", {});
    },

    async requestVoucher() {
      await rpc("aah_request_voucher", {});
    },
  };
}

export type Remote = ReturnType<typeof createRemote>;

const PENDING_KEY = "aah:pendingProfile";
function savePending(p: { nickname: string; phone: string | null }) {
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(p));
  } catch {
    /* 寫唔到就登入後再問暱稱 */
  }
}
function readPending(): { nickname: string; phone: string | null } | null {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(PENDING_KEY) : null;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function clearPending() {
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

function prefsToUser(p: LocalPrefs): Partial<User> {
  return { onboarded: p.onboarded, testMallId: p.testMallId, arrivalShown: p.arrivalShown, outfitToday: p.outfitToday };
}

function rowToPost(r: any, interests: any[], imsgs: any[]): Post {
  const its: Interest[] = interests
    .filter((i) => i.post_id === r.id)
    .map((i) => ({
      id: i.id,
      userId: i.user_id,
      name: i.display_name ?? "用戶",
      at: Date.parse(i.created_at),
      offer: i.offer ?? undefined,
      status: i.status,
      messages: imsgs.filter((m) => m.interest_id === i.id).map((m) => ({ from: m.from_id, text: m.text, at: Date.parse(m.created_at) })),
    }));
  return {
    id: r.id,
    scenario: r.scenario,
    direction: r.direction,
    mallId: r.mall_id,
    mallName: r.mall_name,
    shop: r.shop,
    fields: r.fields ?? {},
    price: r.price,
    payMethods: r.pay_methods ?? [],
    leaveAt: Date.parse(r.leave_at),
    createdAt: Date.parse(r.created_at),
    authorId: r.author_id,
    authorName: r.author_name ?? "用戶",
    verifiedOnSite: !!r.verified_on_site,
    status: r.status,
    pinnedUntil: ts(r.pinned_until),
    pushedCount: r.pushed_count ?? 0,
    viewCount: r.view_count ?? 0,
    interests: its,
    matchId: r.match_id ?? undefined,
    autoAccept: !!r.auto_accept,
    needCount: r.need_count ?? undefined,
  };
}

function rowToMatch(m: any, parts: any[], msgs: any[], uid: string, prefs: LocalPrefs): Match {
  const ps = parts.filter((p) => p.match_id === m.id);
  const mine = ps.find((p) => p.user_id === uid);
  const flags = prefs.matchFlags[m.id] ?? {};
  return {
    id: m.id,
    postId: m.post_id,
    scenario: m.scenario,
    mallId: m.mall_id,
    mallName: m.mall_name,
    shop: m.shop,
    price: m.price,
    payMethods: m.pay_methods ?? [],
    authorId: m.author_id,
    participants: ps.map((p) => ({ userId: p.user_id, name: p.display_name })),
    meetPlace: m.meet_place,
    meetAt: Date.parse(m.meet_at),
    confirmedBy: ps.filter((p) => p.confirmed_at).map((p) => p.user_id),
    arrived: Object.fromEntries(ps.filter((p) => p.arrived_at).map((p) => [p.user_id, Date.parse(p.arrived_at)])),
    outfits: Object.fromEntries(ps.filter((p) => p.outfit).map((p) => [p.user_id, p.outfit])),
    messages: msgs.filter((x) => x.match_id === m.id).map((x) => ({ id: x.id, from: x.from_id ?? "system", text: x.text, at: Date.parse(x.created_at) })),
    status: m.status,
    createdAt: Date.parse(m.created_at),
    endedAt: ts(m.ended_at),
    rated: mine?.rating ?? undefined,
    cancelledBy: m.cancelled_by ?? undefined,
    lateCancel: !!m.late_cancel,
    ratePromptShown: flags.ratePromptShown,
    askedArrival: flags.askedArrival,
  };
}

/** 將 Supabase / function 錯誤轉做用戶睇得明嘅句子 */
export function aahErrorText(e: unknown): string {
  const msg = String((e as any)?.message ?? e ?? "");
  const map: [RegExp, string][] = [
    [/banned/, "你嘅帳戶停用緊，可以喺「我的配對」申訴"],
    [/not registered/, "要先註冊"],
    [/post closed/, "呢個 post 已經結束"],
    [/own post/, "唔可以接自己嘅 post"],
    [/dining daily limit/, "每人每日最多出 3 個食飯候位 post"],
    [/not on site/, "要喺商場先可以出 post"],
    [/bad leave time/, "預計離開時間要喺而家之後"],
    [/pin slots full/, "置頂位已滿（最多 10 個），遲啲再試"],
    [/no pin credits/, "你冇置頂次數"],
    [/payment required/, "置頂要付款（未開放）"],
    [/not at mall|gps required/, "GPS 未確認你喺商場，去到見面地點再撳"],
    [/too early/, "未到約定時間，唔可以報告冇出現"],
    [/reporter has not arrived/, "你要先撳「我到咗」"],
    [/accused arrived/, "對方已經撳咗「我到咗」"],
    [/accused not confirmed/, "對方未確認見面，唔算冇出現；可以直接取消"],
    [/not enough points/, "積分唔夠"],
    [/account too new/, "帳戶要用夠 30 日先可以換禮券"],
    [/monthly quota/, "本月禮券已經換晒"],
    [/appeal window closed/, "申訴期（48 小時）已經過咗"],
    [/already appealed/, "你已經申訴過"],
    [/no open no-show report/, "搵唔到可以申訴嘅紀錄"],
    [/match not active/, "配對已經結束"],
    [/Invalid login credentials/i, "Email 或者密碼唔啱"],
    [/User already registered|already been registered/i, "呢個 email 已經註冊咗，請直接登入"],
    [/Email not confirmed/i, "請先去 email 撳確認連結，再返嚟登入"],
    [/Password should be at least|weak.?password/i, "密碼最少要 6 個字"],
    [/rate limit|over_email_send_rate_limit|For security purposes/i, "發送得太密，請等一陣再試"],
    [/valid email|invalid.*email|email.*invalid/i, "Email 格式唔啱"],
    [/not signed in/, "請先登入"],
    [/duplicate key.*phone|aah_profiles_phone_key/, "呢個電話號碼已經註冊咗"],
    [/Token has expired|invalid.*otp|otp.*invalid/i, "驗證碼唔啱或者過咗期"],
  ];
  for (const [re, text] of map) if (re.test(msg)) return text;
  return msg || "出咗啲問題，請再試";
}
