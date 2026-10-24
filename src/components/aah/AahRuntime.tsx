import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { aah, useAahState, LEAVE_GRACE_MIN, PIN_PROMPT_AFTER_MIN } from "@/lib/aah/store";
import { useAahMalls } from "@/lib/aah/malls";
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

  const toasted = useRef<Set<string>>(new Set());
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
  }, [current.mall?.id, user.onboarded, user.notifyOpportunities]); // eslint-disable-line react-hooks/exhaustive-deps

  // 自己嘅 post：過咗預計離開時間 → 過期，問要唔要延長
  useEffect(() => {
    for (const p of posts) {
      if (p.authorId !== user.id || p.status !== "open") continue;
      if (p.leaveAt <= now) {
        aah.expirePost(p.id);
        const k = `exp:${p.id}:${p.leaveAt}`;
        if (!toasted.current.has(k)) {
          toasted.current.add(k);
          toast("你仲喺度？要唔要延長？", {
            description: `${p.shop} 個 post 已經過咗預計離開時間`,
            action: { label: "延長 15 分鐘", onClick: () => aah.extendPost(p.id, 15) },
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
      for (const p of mine) if (p.mallId !== current.mall?.id) aah.cancelPost(p.id);
      toast("已自動取消你嘅 post", { description: "因為你已經離開咗商場" });
      leftSince.current = null;
      leaveWarned.current = false;
    }
  }, [now, geo.status, current.mall?.id, current.test, posts, user.id]);

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
        action: { label: "👍", onClick: () => aah.rateMatch(m.id, "up") },
        cancel: { label: "👎", onClick: () => aah.rateMatch(m.id, "down") },
        duration: 20000,
      });
    }
  }, [now, matches, current.mall?.id, current.test, geo.status, user.id]);

  return null;
}
