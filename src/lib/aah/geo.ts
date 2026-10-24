import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { AahMall } from "./types";
import { findMallAt } from "./malls";
import { useAahState } from "./store";

export type GeoStatus = "idle" | "locating" | "ok" | "denied" | "unavailable";

type GeoState = { status: GeoStatus; lat?: number; lng?: number; accuracy?: number; at?: number };

let geo: GeoState = { status: "idle" };
let listeners: Array<() => void> = [];
let watchId: number | null = null;

function setGeo(next: GeoState) {
  geo = next;
  listeners.forEach((l) => l());
}

export const geoStore = {
  get: () => geo,
  subscribe(fn: () => void) {
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((l) => l !== fn);
    };
  },
  /** 開始追蹤位置（會觸發系統權限視窗） */
  start(): Promise<GeoStatus> {
    return new Promise((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        setGeo({ status: "unavailable" });
        resolve("unavailable");
        return;
      }
      if (watchId != null) {
        resolve(geo.status);
        return;
      }
      setGeo({ ...geo, status: geo.status === "ok" ? "ok" : "locating" });
      let resolved = false;
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setGeo({ status: "ok", lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, at: Date.now() });
          if (!resolved) {
            resolved = true;
            resolve("ok");
          }
        },
        (err) => {
          const status: GeoStatus = err.code === err.PERMISSION_DENIED ? "denied" : "unavailable";
          setGeo({ status });
          if (watchId != null) navigator.geolocation.clearWatch(watchId);
          watchId = null;
          if (!resolved) {
            resolved = true;
            resolve(status);
          }
        },
        { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 },
      );
    });
  },
};

export function useGeo() {
  return useSyncExternalStore(geoStore.subscribe, geoStore.get, geoStore.get);
}

/** 自動開始追蹤（如果之前已經俾咗權限） */
export function useAutoStartGeo(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    void geoStore.start();
  }, [enabled]);
}

export type CurrentMall = {
  mall: AahMall | null;
  /** 真 GPS 確認 */
  verified: boolean;
  /** 用緊測試位置 */
  test: boolean;
};

export function useCurrentMall(malls: AahMall[]): CurrentMall {
  const g = useGeo();
  const { user } = useAahState();
  return useMemo(() => {
    if (g.status === "ok" && g.lat != null && g.lng != null) {
      const m = findMallAt(malls, g.lat, g.lng);
      if (m) return { mall: m, verified: true, test: false };
    }
    if (user.testMallId) {
      const m = malls.find((x) => x.id === user.testMallId) ?? null;
      if (m) return { mall: m, verified: false, test: true };
    }
    return { mall: null, verified: false, test: false };
  }, [g.status, g.lat, g.lng, malls, user.testMallId]);
}

/** 每隔一段時間更新「而家」，倒數用 */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function fmtClock(ts: number) {
  return new Date(ts).toLocaleTimeString("zh-HK", { hour: "numeric", minute: "2-digit", hour12: false, timeZone: "Asia/Hong_Kong" });
}

export function fmtLeft(ms: number) {
  if (ms <= 0) return "已過期";
  const mins = Math.floor(ms / 60000);
  if (mins >= 60) return `仲有 ${Math.floor(mins / 60)} 個鐘 ${mins % 60} 分鐘`;
  if (mins >= 1) return `仲有 ${mins} 分鐘`;
  return `仲有 ${Math.ceil(ms / 1000)} 秒`;
}

export function fmtAgo(ts: number, now = Date.now()) {
  const mins = Math.floor((now - ts) / 60000);
  if (mins < 1) return "啱啱";
  if (mins < 60) return `${mins} 分鐘前`;
  return `${Math.floor(mins / 60)} 個鐘前`;
}
