import { useEffect, useState } from "react";
import { useAahMode } from "@/lib/aah/store";

export const BRAND = { yellow: "#F6C61A", dark: "#0D4A3A", mint: "#2EB67D", cream: "#FBF6EA" };

/** 啱啱好標誌：黃（機會）+ 深綠（需求）+ 綠點（連接） */
export function BrandMark({ width = 48, className }: { width?: number | string; className?: string }) {
  return (
    <svg viewBox="-10 -10 370 320" width={width} className={className} role="img" aria-label="啱啱好">
      <rect x="70" y="12" width="96" height="276" rx="30" fill={BRAND.yellow} />
      <rect x="214" y="10" width="96" height="280" rx="30" fill={BRAND.dark} />
      <rect x="148" y="104" width="112" height="82" rx="41" fill={BRAND.dark} />
      <path d="M206 104 C214 104 214 96 214 90 L214 200 C214 194 214 186 206 186 Z" fill={BRAND.dark} />
      <ellipse cx="70" cy="196" rx="44" ry="41" fill={BRAND.dark} />
      <ellipse cx="304" cy="158" rx="48" ry="45" fill={BRAND.mint} />
    </svg>
  );
}

/**
 * 開 app 畫面：同 iPhone 主畫面版嘅開機圖一模一樣，載入完先淡出。
 * 最少顯示 0.6 秒（唔會一閃就冇），最多 3 秒（網絡慢都唔會卡住）。
 */
export function SplashScreen() {
  const mode = useAahMode();
  const [minDone, setMinDone] = useState(false);
  const [maxDone, setMaxDone] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const a = setTimeout(() => setMinDone(true), 600);
    const b = setTimeout(() => setMaxDone(true), 3000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);

  const hide = (minDone && mode !== "detecting") || maxDone;
  useEffect(() => {
    if (!hide) return;
    const t = setTimeout(() => setGone(true), 320);
    return () => clearTimeout(t);
  }, [hide]);

  if (gone) return null;
  // 以 390 闊嘅手機為基準，同開機圖比例一致；大螢幕封頂
  const u = (n: number) => `${n < 0 ? "max" : "min"}(${((n / 390) * 100).toFixed(3)}vw, ${n * 1.25}px)`;
  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden transition-opacity duration-300"
      style={{ background: BRAND.cream, opacity: hide ? 0 : 1, pointerEvents: hide ? "none" : "auto" }}
    >
      <BrandMark width={u(140)} />
      <div style={{ fontSize: u(50), fontWeight: 900, color: BRAND.dark, letterSpacing: u(2), marginTop: u(22) }}>啱啱好</div>
      <div style={{ fontSize: u(16), fontWeight: 700, color: BRAND.dark, opacity: 0.8, marginTop: u(8), letterSpacing: u(3) }}>
        啱時間　啱地方　啱啱好
      </div>
      <div className="absolute rounded-[50%]" style={{ bottom: u(-70), left: u(-50), width: u(300), height: u(160), background: BRAND.yellow }} />
      <div className="absolute rounded-[50%]" style={{ bottom: u(-100), right: u(-70), width: u(260), height: u(170), background: BRAND.dark }} />
    </div>
  );
}
