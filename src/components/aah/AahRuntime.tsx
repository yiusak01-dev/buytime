import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { aah, useAahMode, useAahState, LEAVE_GRACE_MIN, PIN_PROMPT_AFTER_MIN } from "@/lib/aah/store";
import { useAahMalls, nearbyMalls } from "@/lib/aah/malls";
import { useAutoStartGeo, useCurrentMall, useGeo, useNow } from "@/lib/aah/geo";

const MIN = 60000;

/**
 * 喺背景跑嘅規則：到埗通知、post 過期、離開商場自動取消、
 * 15 分鐘冇人理提示置頂、離開商場時問評分。
 * 示範版用 app 內通知；正式版會用推送通知。
 */
export function AahRuntime() {
  const navigate = useNavigate();
  const { user, posts, matches } = useAahState();
  const { malls } = useAahMalls();
  useAutoStartGeo(user.onboarded);
  const geo = useGeo();
  const current = useCurrentMall(malls);
  const now = useNow(15000);

  const mode = useAahMode();
  const toasted = useRef<Set<string>>(new Set());
  const pathname = useRouterState({ select: (st) => st.location.pathname });

  // 雲端模式：feed 讀本商場同附近商場；記錄「附近用戶」人數（唔儲存確實位置）
  useEffect(() => {
    const m = current.mall;
    if (!m) return;
    aah.setFeedMalls([m.id, ...nearbyMalls(malls, m).map((x) => x.id)]);
  }, [current.mall?.id, malls, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (current.mall && user.registered) aah.touchPresence(current.mall.id);
  }, [current.mall?.id, user.registered, now, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const leftSince = useRef<number | null>(null);
  const leaveWarned = useRef(false);

  // 到埗通知：「啱啱好！附近有 X 個着數」，每個商場每日最多一次，0 個唔發
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
    toast(`啱啱好！附近有 ${count} 個着數`, {
      description: `${m.name} 而家有 ${count} 個着數，即刻睇吓`,
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
      if (age >= PIN_PROMPT_AFTER_MIN * MIN && p.interests.length === 0 && !((p.pinnedUntil ?? 0) > now) && !toasted.current.has(k2)) {
        toasted.current.add(k2);
        toast("15 分鐘都未有人理", {
          description: "$5 置頂 15 分鐘，同時推送俾附近嘅人？",
          action: { label: "睇吓", onClick: () => navigate({ to: "/post/$postId", params: { postId: p.id } }) },
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

  // 對方取消咗配對：即刻話你知，同埋俾你睇附近其他着數
  const prevStatus = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    const first = prevStatus.current == null;
    const map = prevStatus.current ?? new Map<string, string>();
    for (const m of matches) {
      const before = map.get(m.id);
      map.set(m.id, m.status);
      if (first || before !== "active" || m.status !== "cancelled") continue;
      if (!m.participants.some((p) => p.userId === user.id) || !m.cancelledBy || m.cancelledBy === user.id) continue;
      toast("對方取消咗配對", {
        description: m.lateCancel && m.arrived[user.id] ? "你已經到咗，已記錄對方臨時取消，並補償你 20 分" : `${m.shop}・${m.mallName}`,
        action: { label: "睇附近着數", onClick: () => navigate({ to: "/", search: { cat: m.scenario } }) },
        duration: 12000,
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
        if (pathname === `/post/${p.id}`) continue;
        const last = i.messages[i.messages.length - 1]?.text;
        toast(`${i.name} 想要你嘅${p.shop}`, {
          description: last ? `「${last}」` : "去睇吓",
          action: { label: "睇吓", onClick: () => navigate({ to: "/post/$postId", params: { postId: p.id } }) },
          duration: 12000,
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
          toast.success("配對成功！", {
            description: `${m.shop}・${m.mallName}，去確認見面地點`,
            action: { label: "去配對", onClick: () => navigate({ to: "/match/$matchId", params: { matchId: m.id } }) },
            duration: 15000,
          });
        }
      }
      const last = m.messages[m.messages.length - 1];
      if (!last || last.from === "system" || last.from === user.id) continue;
      const km = `msg:${last.id}`;
      if (alerted.current.has(km) || !fresh(last.at)) continue;
      alerted.current.add(km);
      if (onMatch) continue;
      const name = m.participants.find((p) => p.userId === last.from)?.name ?? "對方";
      toast(`${name}：${last.text}`, {
        description: `${m.shop}・${m.mallName}`,
        action: { label: "睇吓", onClick: () => navigate({ to: "/match/$matchId", params: { matchId: m.id } }) },
        duration: 10000,
      });
    }
  }, [matches, user.id, user.registered, pathname, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  // 完成之後：離開商場（或者完成 10 分鐘後）喺通知入面撳 👍 👎，可以唔答
  useEffect(() => {
    for (const m of matches) {
      if (m.status !== "completed" || m.rated || m.ratePromptShown) continue;
      if (!m.participants.some((p) => p.userId === user.id)) continue;
      // 只有 GPS 真係確認咗唔喺嗰個商場先當離開（未搵到位置唔算）
      const left = geo.status === "ok" && !current.test && current.mall?.id !== m.mallId;
      const later = now - (m.endedAt ?? now) > 10 * MIN;
      if (!left && !later) continue;
      aah.markRatePrompt(m.id);
      toast(`啱啱喺 ${m.mallName} ${m.scenario === "groupbuy" ? "夾單" : "交收"}順唔順利？`, {
        action: { label: "👍", onClick: () => void aah.rateMatch(m.id, "up").catch(() => {}) },
        cancel: { label: "👎", onClick: () => void aah.rateMatch(m.id, "down").catch(() => {}) },
        duration: 20000,
      });
    }
  }, [now, matches, current.mall?.id, current.test, geo.status, user.id]);

  return null;
}
