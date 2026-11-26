import { readHowSeen } from "./Onboarding";
import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { aah, getRules, testLocationAllowed, useAahMode, useAahState, LEAVE_GRACE_MIN, PIN_PROMPT_AFTER_MIN } from "@/lib/aah/store";
import { useAahMalls, nearbyMalls } from "@/lib/aah/malls";
import { useAutoStartGeo, useCurrentMall, useGeo, useNow } from "@/lib/aah/geo";
import { syncPush } from "@/lib/aah/push";
import { buzz } from "@/lib/aah/buzz";
import { done, notify } from "@/lib/aah/notify";

const MIN = 60000;

/**
 * 喺背景跑嘅規則：到埗通知、post 過期、離開商場自動取消、
 * 15 分鐘冇人理提示置頂（管理頁開咗置頂先會）、離開商場時問評分。
 * 示範版用 app 內通知；正式版會用推送通知。
 */
export function AahRuntime() {
  const navigate = useNavigate();
  const { user, posts, matches } = useAahState();
  const { malls } = useAahMalls();
  // 睇過新手教學就開定位（教學記錄喺 localStorage，帳戶資料未載入都得）
  useAutoStartGeo(user.onboarded || readHowSeen());
  const geo = useGeo();
  const current = useCurrentMall(malls);
  const now = useNow(15000);

  const mode = useAahMode();
  const toasted = useRef<Set<string>>(new Set());
  const pathname = useRouterState({ select: (st) => st.location.pathname });

  // 雲端模式：feed 讀本商場同附近商場；記錄「附近用戶」人數（唔儲存確實位置）
  useEffect(() => {
    const m = current.mall;
    // 唔喺任何商場：讀全港最新，好奇打開嘅人都見到有人放咩
    if (!m) {
      aah.setFeedMalls(["*"]);
      return;
    }
    aah.setFeedMalls([m.id, ...nearbyMalls(malls, m).map((x) => x.id)]);
  }, [current.mall?.id, malls, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // 只計真係喺場（GPS 確認）嘅人；揀商場睇吓唔算（即時人數唔可以虛報）
    if (current.mall && user.registered && (current.verified || (current.test && testLocationAllowed()))) aah.touchPresence(current.mall.id);
  }, [current.mall?.id, user.registered, now, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  // 推送：登入後確保呢部裝置登記咗；舊金鑰嘅訂閱會換走
  useEffect(() => {
    if (mode !== "remote") return;
    void syncPush(!!user.registered);
  }, [mode, user.registered, user.id]);

  const leftSince = useRef<number | null>(null);
  const leaveWarned = useRef(false);

  // App 內提示：見下面「App 內提示」（一次只出一個，舊嘅版本會同推送重複彈，已經拎走）

  // 我去緊：GPS 確認咗到咗嗰個商場，就自動話對方知（轉做已喺場；自動配對嘅 post 會即刻配對）
  const onSiteTried = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    const m = current.mall;
    if (!m || !current.verified || geo.lat == null || geo.lng == null) return;
    for (const p of posts) {
      if (p.mallId !== m.id || p.status !== "open") continue;
      const mine = p.interests.find((i) => i.userId === user.id);
      if (!mine || !mine.enRoute || mine.status !== "pending") continue;
      const last = onSiteTried.current.get(p.id) ?? 0;
      if (Date.now() - last < 60000) continue;
      onSiteTried.current.set(p.id, Date.now());
      void aah
        .interestOnSite(p.id, { lat: geo.lat, lng: geo.lng })
        .then((matchId) => {
          if (matchId) {
            navigate({ to: "/match/$matchId", params: { matchId } });
          } else {
            done("已經話對方知你到咗", `${p.shop}・${m.name}`);
          }
        })
        .catch(() => {});
    }
  }, [current.mall?.id, current.verified, geo.lat, geo.lng, posts, user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 到埗通知：「啱啱好！附近有 X 樣等緊人接」，每個商場每日最多一次，0 個唔發
  useEffect(() => {
    const m = current.mall;
    if (!m || !user.onboarded || !user.notifyOpportunities) return;
    const key = `${m.id}|${new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)}`;
    if (user.arrivalShown[key]) return;
    aah.ensureDemoPosts(m);
    const count = aah
      .get()
      .posts.filter((p) => p.mallId === m.id && p.status === "open" && p.leaveAt > Date.now() && p.authorId !== user.id && user.notifyCats.includes(p.scenario)).length;
    if (count === 0) return;
    aah.markArrivalShown(m.id);
    // 已經喺搵／放頁（/join 而家轉去搵）：列表同即時動態已經見到，唔使再彈
    if (pathname === "/" || pathname === "/give" || pathname === "/join") return;
    toast(`啱啱好！附近有 ${count} 樣等緊人接`, {
      description: `${m.name} 而家有 ${count} 樣放緊，即刻睇吓`,
      action: { label: "睇吓", onClick: () => navigate({ to: "/" }) },
      duration: 8000,
    });
  }, [current.mall?.id, user.onboarded, user.notifyOpportunities, posts, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // 自己嘅 post：過咗預計離開時間 → 過期，問要唔要延長
  useEffect(() => {
    for (const p of posts) {
      if (p.authorId !== user.id || p.status !== "open") continue;
      if (p.leaveAt <= now) {
        void aah.expirePost(p.id).catch(() => {});
        const k = `exp:${p.id}:${p.leaveAt}`;
        if (!toasted.current.has(k)) {
          toasted.current.add(k);
          toast("你仲喺度？要唔要延長？", {
            description: `${p.shop} 個 post 已經過咗預計離開時間`,
            action: { label: "延長 15 分鐘", onClick: () => void aah.extendPost(p.id, 15).catch(() => {}) },
            duration: 15000,
          });
        }
        continue;
      }
      // 15 分鐘冇人理先提示置頂
      const age = now - p.createdAt;
      const k2 = `pin:${p.id}`;
      if (getRules().pinEnabled && age >= PIN_PROMPT_AFTER_MIN * MIN && p.interests.length === 0 && !((p.pinnedUntil ?? 0) > now) && !toasted.current.has(k2)) {
        toasted.current.add(k2);
        toast("15 分鐘都未有人理", {
          description: "置頂 15 分鐘，同時推送俾附近嘅人？",
          action: { label: "睇吓", onClick: () => navigate({ to: "/post/$postId", params: { postId: p.id } }) },
          duration: 10000,
        });
      }
      // 10 分鐘冇人理（有價錢）：提佢可以減價再推（取代講價）
      const k3 = `drop:${p.id}`;
      if (
        !getRules().pinEnabled &&
        (p.price ?? 0) > 0 &&
        age >= 10 * MIN &&
        p.interests.length === 0 &&
        !p.fields.priceDropAt &&
        !toasted.current.has(k3)
      ) {
        toasted.current.add(k3);
        notify("10 分鐘都未有人理，減少少價再推？", {
          body: `${p.shop}・而家 $${p.price}`,
          onOpen: () => navigate({ to: "/post/$postId", params: { postId: p.id } }),
          duration: 10000,
        });
      }
      // 置頂：配對成功、過期或者離開商場都會結束（喺 store 處理過期同配對）
    }
  }, [now, posts, user.id, navigate]);

  // 離開商場：5 分鐘緩衝（地下停車場收唔到 GPS 唔當離開），之後提示，再過 2 分鐘取消
  useEffect(() => {
    if (current.test) {
      leftSince.current = null;
      return;
    }
    const mine = posts.filter((p) => p.authorId === user.id && p.status === "open");
    if (mine.length === 0) {
      leftSince.current = null;
      leaveWarned.current = false;
      return;
    }
    const gpsOk = geo.status === "ok";
    const stillThere = mine.every((p) => current.mall?.id === p.mallId);
    if (!gpsOk || stillThere) {
      leftSince.current = null;
      leaveWarned.current = false;
      return;
    }
    if (leftSince.current == null) leftSince.current = Date.now();
    const away = Date.now() - leftSince.current;
    if (away >= LEAVE_GRACE_MIN * MIN && !leaveWarned.current) {
      leaveWarned.current = true;
      toast("你好似離開咗商場", {
        description: "個 post 會喺 2 分鐘後自動取消",
        action: {
          label: "我仲喺度",
          onClick: () => {
            leftSince.current = Date.now();
            leaveWarned.current = false;
          },
        },
        duration: 120000,
      });
    }
    if (away >= (LEAVE_GRACE_MIN + 2) * MIN) {
      for (const p of mine) if (p.mallId !== current.mall?.id) void aah.cancelPost(p.id).catch(() => {});
      toast("已自動取消你嘅 post", { description: "因為你已經離開咗商場" });
      leftSince.current = null;
      leaveWarned.current = false;
    }
  }, [now, geo.status, current.mall?.id, current.test, posts, user.id]);

  // 對方取消咗配對：即刻話你知，同埋俾你睇附近仲有咩
  const prevStatus = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    const first = prevStatus.current == null;
    const map = prevStatus.current ?? new Map<string, string>();
    for (const m of matches) {
      const before = map.get(m.id);
      map.set(m.id, m.status);
      if (!first && before === "active" && m.status === "noshow" && m.participants.some((p) => p.userId === user.id) && !m.arrived[user.id]) {
        toast.error("對方報告你冇出現", {
          description: "帳戶停用 30 日；有誤會可以喺 48 小時內申訴",
          action: { label: "申訴", onClick: () => navigate({ to: "/me" }) },
          duration: 20000,
        });
        continue;
      }
      if (first || before !== "active" || m.status !== "cancelled") continue;
      if (!m.participants.some((p) => p.userId === user.id) || !m.cancelledBy || m.cancelledBy === user.id) continue;
      notify("對方取消咗配對，撳睇附近仲有咩", {
        body: m.lateCancel && m.arrived[user.id] ? "你已經到咗，已記錄對方臨時取消" : `${m.shop}・${m.mallName}`,
        onOpen: () => navigate({ to: "/", search: { cat: m.scenario } }),
        duration: 10000,
      });
    }
    prevStatus.current = map;
  }, [matches, user.id, navigate]);

  // App 內提示（未有推送通知之前）：有人有興趣、配對成功、對方傳訊息。
  // 只提示啱啱發生（90 秒內）嘅嘢，同埋唔喺相關畫面先提示，避免一開 app 彈晒舊嘢出嚟。
  const alerted = useRef<Set<string>>(new Set());
  const fresh = (at: number) => Date.now() - at < 90 * 1000;
  useEffect(() => {
    if (!user.registered) return;
    for (const p of posts) {
      if (p.authorId !== user.id || p.status !== "open") continue;
      for (const i of p.interests) {
        const k = `int:${p.id}:${i.userId}`;
        if (i.status !== "pending" || alerted.current.has(k) || !fresh(i.at)) continue;
        alerted.current.add(k);
        void buzz();
        if (pathname === `/post/${p.id}`) continue;
        const last = i.messages[i.messages.length - 1]?.text;
        notify(`${i.name} 對你個 post 有興趣`, {
          body: last ? `${p.shop}・「${last}」` : p.shop,
          onOpen: () => navigate({ to: "/post/$postId", params: { postId: p.id } }),
        });
      }
    }
  }, [posts, user.id, user.registered, pathname, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  // 未配對之前嘅對話：對方覆咗你（買家）或者有興趣嘅人再講嘢（出 post 嘅人）
  useEffect(() => {
    if (!user.registered) return;
    for (const p of posts) {
      if (p.status !== "open") continue;
      const mineAuthor = p.authorId === user.id;
      for (const i of p.interests) {
        if (i.status !== "pending" || (!mineAuthor && i.userId !== user.id)) continue;
        const last = i.messages[i.messages.length - 1];
        // 第一句（撳有興趣嗰句）上面已經提示咗
        if (!last || last.from === user.id || i.messages.length < 2) continue;
        const k = `imsg:${p.id}:${i.userId}:${last.at}`;
        if (alerted.current.has(k) || !fresh(last.at)) continue;
        alerted.current.add(k);
        void buzz();
        if (pathname === `/post/${p.id}`) continue;
        const name = mineAuthor ? i.name : p.authorName || "對方";
        notify(`${name}：${last.text}`, {
          body: p.shop,
          onOpen: () => navigate({ to: "/post/$postId", params: { postId: p.id } }),
        });
      }
    }
  }, [posts, user.id, user.registered, pathname, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user.registered) return;
    for (const m of matches) {
      if (m.status !== "active" || !m.participants.some((p) => p.userId === user.id)) continue;
      const onMatch = pathname === `/match/${m.id}`;
      const k = `match:${m.id}`;
      if (!alerted.current.has(k) && fresh(m.createdAt)) {
        alerted.current.add(k);
        // 喺 post 頁面嘅話嗰版會自己跳去配對
        if (!onMatch && pathname !== `/post/${m.postId}`) {
          void buzz();
          notify("配對成功！撳入去確認見面地點", {
            body: `${m.shop}・${m.mallName}`,
            onOpen: () => navigate({ to: "/match/$matchId", params: { matchId: m.id } }),
            duration: 10000,
          });
        }
      }
      const last = m.messages[m.messages.length - 1];
      if (!last || last.from === "system" || last.from === user.id) continue;
      const km = `msg:${last.id}`;
      if (alerted.current.has(km) || !fresh(last.at)) continue;
      alerted.current.add(km);
      void buzz();
      if (onMatch) continue;
      const name = m.participants.find((p) => p.userId === last.from)?.name ?? "對方";
      notify(`${name}：${last.text}`, {
        body: `${m.shop}・${m.mallName}`,
        onOpen: () => navigate({ to: "/match/$matchId", params: { matchId: m.id } }),
      });
    }
  }, [matches, user.id, user.registered, pathname, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  // 申訴結果：停用被撤銷時話俾佢知
  const wasBanned = useRef<boolean | null>(null);
  useEffect(() => {
    const banned = !!(user.bannedUntil && user.bannedUntil > Date.now());
    if (wasBanned.current === true && !banned && user.appeal?.status === "approved") {
      toast.success("申訴成功", { description: "已經撤銷冇出現，帳戶已經恢復", duration: 12000 });
    }
    if (wasBanned.current === true && banned && user.appeal?.status === "rejected" && !toasted.current.has("appeal-rejected")) {
      toasted.current.add("appeal-rejected");
      toast("申訴審核咗", { description: "維持停用，到期會自動恢復", duration: 12000 });
    }
    if (user.registered) wasBanned.current = banned;
  }, [user.bannedUntil, user.appeal?.status, user.registered]);

  // 完成之後問交收順唔順利：改咗喺「搵」「放」頂部嘅卡度問（LiveBanner），唔再彈提示遮住畫面

  return null;
}
