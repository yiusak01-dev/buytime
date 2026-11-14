import { useEffect, useState } from "react";
import { useAahMode } from "@/lib/aah/store";

/** 跟 Logo Guidebook v1.1：Deep Green、Signal Yellow、Sun Field（只做背景） */
export const BRAND = { yellow: "#FDB801", dark: "#094E3C", sun: "#FEE64E", cream: "#FBF6EA" };

/** 批准咗嘅 master icon（PNG，唔重畫） */
export const LOGO_SRC = "/brand/logo.png";
const RATIO = 584 / 618;

export function BrandMark({ width = 48, className }: { width?: number | string; className?: string }) {
  return <img src={LOGO_SRC} width={typeof width === "number" ? width : undefined} style={{ width }} className={className} alt="啱啱好" />;
}

/**
 * 動態 logo：用 master artwork 切開嘅四塊（黃左主體、綠右主體＋中間連接、綠左節點、黃右節點），
 * 每塊都喺原本位置出場，冇變形、冇旋轉、冇改色；最後換返完整 master，同靜態 logo 一模一樣。
 */
export function AnimatedMark({ width }: { width: string }) {
  const part = (n: string, cls: string) => (
    <img src={`/brand/${n}.png`} alt="" className={`absolute inset-0 w-full h-full ${cls}`} draggable={false} />
  );
  return (
    <div className="relative" style={{ width, aspectRatio: `${1 / RATIO}` }} role="img" aria-label="啱啱好">
      <style>{`
        @keyframes bt-up { from { clip-path: inset(100% 0 0 0) } to { clip-path: inset(0 0 0 0) } }
        @keyframes bt-down { from { clip-path: inset(0 0 100% 0) } to { clip-path: inset(0 0 0 0) } }
        @keyframes bt-pop { 0% { transform: scale(0) } 70% { transform: scale(1.12) } 100% { transform: scale(1) } }
        @keyframes bt-hide { to { visibility: hidden } }
        @keyframes bt-show { from { visibility: hidden } to { visibility: visible } }
        @keyframes bt-breathe { 0%,100% { transform: scale(1) } 50% { transform: scale(1.045) } }
        .bt-lb { animation: bt-up .42s cubic-bezier(.2,.8,.2,1) both }
        .bt-rb { animation: bt-down .42s cubic-bezier(.2,.8,.2,1) .12s both }
        .bt-ln { transform-origin: 16.26% 63.87%; animation: bt-pop .34s ease-out .48s both }
        .bt-rn { transform-origin: 83.82% 51.11%; animation: bt-pop .34s ease-out .64s both }
        .bt-parts { animation: bt-hide 0s 1s forwards }
        .bt-master { animation: bt-show 0s 1s both, bt-breathe .5s ease-in-out 1s both }
        @media (prefers-reduced-motion: reduce) {
          .bt-parts { display: none } .bt-master { animation: none }
        }
      `}</style>
      <div className="bt-parts absolute inset-0">
        {part("lb", "bt-lb")}
        {part("rb", "bt-rb")}
        {part("ln", "bt-ln")}
        {part("rn", "bt-rn")}
      </div>
      <img src={LOGO_SRC} alt="" className="bt-master absolute inset-0 w-full h-full" draggable={false} />
    </div>
  );
}

/**
 * 開 app 畫面：logo 動畫行完（約 1.5 秒）先淡出；網絡慢最多等 3 秒。
 */
export function SplashScreen() {
  const mode = useAahMode();
  const [minDone, setMinDone] = useState(false);
  const [maxDone, setMaxDone] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const a = setTimeout(() => setMinDone(true), reduce ? 600 : 1500);
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
      data-testid="splash"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden transition-opacity duration-300"
      style={{ background: BRAND.cream, opacity: hide ? 0 : 1, pointerEvents: hide ? "none" : "auto" }}
    >
      <AnimatedMark width={u(140)} />
      {/* 名稱係次級排版，同 icon 保持最少 ½X（X = 節點直徑）距離 */}
      <div
        className="animate-in fade-in duration-500"
        style={{ animationDelay: "700ms", animationFillMode: "both", display: "flex", flexDirection: "column", alignItems: "center" }}
      >
        <div style={{ fontSize: u(50), fontWeight: 900, color: BRAND.dark, letterSpacing: u(2), marginTop: u(26) }}>啱啱好</div>
        <div style={{ fontSize: u(16), fontWeight: 700, color: BRAND.dark, opacity: 0.8, marginTop: u(8), letterSpacing: u(3) }}>
          啱時間　啱地方　啱啱好
        </div>
      </div>
      <div className="absolute rounded-[50%]" style={{ bottom: u(-70), left: u(-50), width: u(300), height: u(160), background: BRAND.yellow }} />
      <div className="absolute rounded-[50%]" style={{ bottom: u(-100), right: u(-70), width: u(260), height: u(170), background: BRAND.dark }} />
    </div>
  );
}
