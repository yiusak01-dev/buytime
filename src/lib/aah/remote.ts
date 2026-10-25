import { supabase } from "@/integrations/supabase/client";
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
  let again = false;
  let channel: any = null;
  let lastPresence = 0;

  async function refreshNow() {
    const { data: sess } = await sb().auth.getSession();
    uid = sess?.session?.user?.id ?? null;
    const prefs = host.prefs();
    const base = host.baseUser();

    // 用戶
    let user: User = { ...base, ...prefsToUser(prefs), id: uid ?? base.id, registered: false };
    if (uid) {
      const [{ data: prof }, { data: appeal }, { data: vouchers }] = await Promise.all([
        sb().from("aah_profiles").select("*").eq("id", uid).maybeSingle(),
        sb().from("aah_appeals").select("text, status, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(1),
        sb().from("aah_voucher_requests").select("status, created_at").eq("user_id", uid).eq("status", "pending"),
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
        };
      }
    }

    // Post：商場 feed + 我出嘅 + 我有興趣嘅
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const queries: Promise<any>[] = [];
    if (feedMalls.length) {
      queries.push(
        sb().from("aah_posts").select("*").in("mall_id", feedMalls).eq("status", "open").gt("leave_at", new Date(Date.now() - 60000).toISOString()).order("created_at", { ascending: false }).limit(200),
      );
    }
    if (uid) {
      queries.push(sb().from("aah_posts").select("*").eq("author_id", uid).gt("created_at", since).order("created_at", { ascending: false }).limit(50));
      const { data: myInt } = await sb().from("aah_interests").select("post_id").eq("user_id", uid).gt("created_at", since);
      const ids = (myInt ?? []).map((r: any) => r.post_id);
      if (ids.length) queries.push(sb().from("aah_posts").select("*").in("id", ids));
    }
    const results = await Promise.all(queries);
    const postRows = new Map<string, any>();
    for (const r of results) for (const row of r.data ?? []) postRows.set(row.id, row);

    const postIds = [...postRows.keys()];
    let interests: any[] = [];
    let imsgs: any[] = [];
    if (postIds.length && uid) {
      const { data } = await sb().from("aah_interests").select("*").in("post_id", postIds);
      interests = data ?? [];
      const iids = interests.map((i) => i.id);
      if (iids.length) {
        const { data: m } = await sb().from("aah_interest_messages").select("*").in("interest_id", iids).order("created_at");
        imsgs = m ?? [];
      }
    }
    const posts: Post[] = [...postRows.values()].map((r) => rowToPost(r, interests, imsgs)).sort((a, b) => b.createdAt - a.createdAt);

    // 配對（RLS 只會俾返我有份嘅）
    let matches: Match[] = [];
    if (uid) {
      const { data: mrows } = await sb().from("aah_matches").select("*").gt("created_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()).order("created_at", { ascending: false });
      const mids = (mrows ?? []).map((m: any) => m.id);
      let parts: any[] = [];
      let msgs: any[] = [];
      if (mids.length) {
        const [p, m] = await Promise.all([
          sb().from("aah_match_participants").select("*").in("match_id", mids),
          sb().from("aah_messages").select("*").in("match_id", mids).order("created_at"),
        ]);
        parts = p.data ?? [];
        msgs = m.data ?? [];
      }
      matches = (mrows ?? []).map((m: any) => rowToMatch(m, parts, msgs, uid!, prefs));
    }

    host.set({ user, posts, matches });
  }

  async function refresh() {
    if (inflight) {
      again = true;
      return inflight;
    }
    inflight = (async () => {
      try {
        await refreshNow();
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

  function scheduleRefresh() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void refresh(), 250);
  }

  function subscribe() {
    if (channel) sb().removeChannel(channel);
    channel = sb().channel(`aah-${uid ?? "anon"}`);
    for (const table of ["aah_posts", "aah_interests", "aah_interest_messages", "aah_matches", "aah_match_participants", "aah_messages", "aah_profiles"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, scheduleRefresh);
    }
    channel.subscribe();
  }

  async function start() {
    await refresh();
    subscribe();
    sb().auth.onAuthStateChange(() => {
      void refresh().then(subscribe);
    });
    // 後備：每 20 秒同步一次（realtime 斷線時都唔會漏）
    setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") void refresh();
    }, 20000);
  }

  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await sb().rpc(name, args);
    if (error) throw error;
    scheduleRefresh();
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

    /** 開始電話驗證：有短訊服務就發驗證碼，冇就用匿名登入（電話未驗證） */
    async startPhoneAuth(phone: string): Promise<"otp" | "session" | "anon"> {
      const { data: sess } = await sb().auth.getSession();
      if (sess?.session) return "session";
      const { error } = await sb().auth.signInWithOtp({ phone });
      if (!error) return "otp";
      const anon = await sb().auth.signInAnonymously();
      if (!anon.error) return "anon";
      throw new Error("register unavailable");
    },

    async verifyOtp(phone: string, token: string) {
      const { error } = await sb().auth.verifyOtp({ phone, token, type: "sms" });
      if (error) throw error;
    },

    async completeRegistration(phone: string, nickname: string) {
      const { data: sess } = await sb().auth.getSession();
      const id = sess?.session?.user?.id;
      if (!id) throw new Error("not signed in");
      const { data: existing } = await sb().from("aah_profiles").select("id").eq("id", id).maybeSingle();
      if (existing) {
        const { error } = await sb().from("aah_profiles").update({ nickname }).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await sb().from("aah_profiles").insert({ id, phone, nickname });
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
      await refresh();
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
      await refresh();
      return matchId ?? undefined;
    },

    async acceptInterest(postId: string, userId: string, price?: number): Promise<string | undefined> {
      const id = await rpc("aah_accept_interest", { p_interest: interestId(postId, userId), p_price: price ?? null });
      await refresh();
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
      await refresh();
      return r as "completed" | "waiting";
    },

    async confirmPartnerMet(matchId: string, userId: string) {
      const r = await rpc("aah_confirm_partner_met", { p_match: matchId, p_user: userId });
      await refresh();
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
    [/not enough points/, "積分唔夠"],
    [/account too new/, "帳戶要用夠 30 日先可以換禮券"],
    [/monthly quota/, "本月禮券已經換晒"],
    [/appeal window closed/, "申訴期（48 小時）已經過咗"],
    [/already appealed/, "你已經申訴過"],
    [/no open no-show report/, "搵唔到可以申訴嘅紀錄"],
    [/match not active/, "配對已經結束"],
    [/register unavailable/, "註冊暫時用唔到：要喺 Supabase 開啟電話驗證或者匿名登入"],
    [/duplicate key.*phone|aah_profiles_phone_key/, "呢個電話號碼已經註冊咗"],
    [/Token has expired|invalid.*otp|otp.*invalid/i, "驗證碼唔啱或者過咗期"],
  ];
  for (const [re, text] of map) if (re.test(msg)) return text;
  return msg || "出咗啲問題，請再試";
}
