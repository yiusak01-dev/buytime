import type { Outfit } from "@/lib/aah/types";

export const OUTFIT_COLORS: { hex: string; label: string }[] = [
  { hex: "#1F2937", label: "黑" },
  { hex: "#F9FAFB", label: "白" },
  { hex: "#9CA3AF", label: "灰" },
  { hex: "#2563EB", label: "藍" },
  { hex: "#1E3A8A", label: "深藍" },
  { hex: "#DC2626", label: "紅" },
  { hex: "#15803D", label: "綠" },
  { hex: "#EAB308", label: "黃" },
  { hex: "#A16207", label: "啡" },
  { hex: "#F472B6", label: "粉紅" },
];

export const DEFAULT_OUTFIT: Outfit = {
  hair: "short",
  top: { style: "tshirt", color: "#F9FAFB" },
  bottom: { style: "pants", color: "#1E3A8A" },
  outer: { style: "none", color: "#1F2937" },
  accessories: [],
};

const SKIN = "#E7E2DA"; // 中性色，唔表示膚色
const HAIR = "#2B2B2B";
const LINE = "rgba(0,0,0,0.28)";

/** 公仔：只描述當日打扮（髮型、衫褲、外套、配件），唔顯示其他身體特徵 */
export function Avatar({ outfit, size = 120, className }: { outfit?: Outfit | null; size?: number; className?: string }) {
  const o = outfit ?? DEFAULT_OUTFIT;
  const unknown = !outfit;
  const h = size * 1.7;
  const longSleeve = o.top.style !== "tshirt";

  return (
    <svg viewBox="0 0 100 170" width={size} height={h} className={className} role="img" aria-label="對方當日打扮">
      {/* 背囊（喺身後） */}
      {o.accessories.includes("backpack") && <rect x="24" y="52" width="52" height="48" rx="8" fill="#374151" />}

      {/* 長髮後面部份 */}
      {o.hair === "long" && <path d="M33 26 Q33 10 50 10 Q67 10 67 26 L69 62 Q50 68 31 62 Z" fill={HAIR} />}

      {/* 頸 */}
      <rect x="45" y="38" width="10" height="8" fill={SKIN} />

      {/* 手臂 */}
      <rect x="20" y="50" width="11" height="48" rx="5" fill={longSleeve ? o.top.color : SKIN} stroke={LINE} strokeWidth="0.6" />
      <rect x="69" y="50" width="11" height="48" rx="5" fill={longSleeve ? o.top.color : SKIN} stroke={LINE} strokeWidth="0.6" />
      {!longSleeve && (
        <>
          <rect x="20" y="50" width="11" height="14" rx="4" fill={o.top.color} stroke={LINE} strokeWidth="0.6" />
          <rect x="69" y="50" width="11" height="14" rx="4" fill={o.top.color} stroke={LINE} strokeWidth="0.6" />
        </>
      )}
      <circle cx="25.5" cy="100" r="4.5" fill={SKIN} />
      <circle cx="74.5" cy="100" r="4.5" fill={SKIN} />

      {/* 腳 */}
      {o.bottom.style === "pants" ? (
        <>
          <rect x="34" y="104" width="15" height="54" rx="3" fill={o.bottom.color} stroke={LINE} strokeWidth="0.6" />
          <rect x="51" y="104" width="15" height="54" rx="3" fill={o.bottom.color} stroke={LINE} strokeWidth="0.6" />
        </>
      ) : (
        <>
          <rect x="36" y="110" width="11" height="48" rx="3" fill={SKIN} />
          <rect x="53" y="110" width="11" height="48" rx="3" fill={SKIN} />
          {o.bottom.style === "shorts" ? (
            <>
              <rect x="34" y="104" width="15" height="20" rx="3" fill={o.bottom.color} stroke={LINE} strokeWidth="0.6" />
              <rect x="51" y="104" width="15" height="20" rx="3" fill={o.bottom.color} stroke={LINE} strokeWidth="0.6" />
            </>
          ) : (
            <path d="M34 102 L66 102 L72 130 L28 130 Z" fill={o.bottom.color} stroke={LINE} strokeWidth="0.6" />
          )}
        </>
      )}
      {/* 鞋 */}
      <rect x="32" y="156" width="17" height="7" rx="3" fill="#222" />
      <rect x="51" y="156" width="17" height="7" rx="3" fill="#222" />

      {/* 上身 */}
      <path d="M31 48 Q50 42 69 48 L68 106 L32 106 Z" fill={o.top.color} stroke={LINE} strokeWidth="0.6" />
      {o.top.style === "shirt" && (
        <>
          <path d="M43 46 L50 56 L57 46" fill="none" stroke={LINE} strokeWidth="1.2" />
          <line x1="50" y1="56" x2="50" y2="104" stroke={LINE} strokeWidth="0.8" />
        </>
      )}
      {o.top.style === "sweater" && <path d="M42 46 Q50 52 58 46" fill="none" stroke={LINE} strokeWidth="1.6" />}

      {/* 外套 */}
      {o.outer.style !== "none" && (
        <>
          <path
            d={o.outer.style === "coat" ? "M29 48 Q38 44 46 46 L46 132 L27 132 Z" : "M29 48 Q38 44 46 46 L46 108 L29 108 Z"}
            fill={o.outer.color}
            stroke={LINE}
            strokeWidth="0.6"
          />
          <path
            d={o.outer.style === "coat" ? "M71 48 Q62 44 54 46 L54 132 L73 132 Z" : "M71 48 Q62 44 54 46 L54 108 L71 108 Z"}
            fill={o.outer.color}
            stroke={LINE}
            strokeWidth="0.6"
          />
          <rect x="19" y="49" width="12" height="49" rx="5" fill={o.outer.color} stroke={LINE} strokeWidth="0.6" />
          <rect x="69" y="49" width="12" height="49" rx="5" fill={o.outer.color} stroke={LINE} strokeWidth="0.6" />
        </>
      )}

      {/* 背囊帶 */}
      {o.accessories.includes("backpack") && (
        <>
          <line x1="37" y1="47" x2="37" y2="80" stroke="#374151" strokeWidth="3" />
          <line x1="63" y1="47" x2="63" y2="80" stroke="#374151" strokeWidth="3" />
        </>
      )}

      {/* 手袋 */}
      {o.accessories.includes("handbag") && (
        <>
          <path d="M70 100 Q75 92 80 100" fill="none" stroke="#7C2D12" strokeWidth="1.5" />
          <rect x="67" y="100" width="16" height="13" rx="2" fill="#9A3412" />
        </>
      )}

      {/* 頭 */}
      <circle cx="50" cy="26" r="14" fill={SKIN} />
      {/* 頭髮 */}
      <path d="M36 25 Q36 10 50 10 Q64 10 64 25 Q58 17 50 18 Q42 17 36 25 Z" fill={HAIR} />

      {/* 眼鏡 */}
      {o.accessories.includes("glasses") && (
        <g fill="none" stroke="#111" strokeWidth="1.3">
          <circle cx="44.5" cy="27" r="4" />
          <circle cx="55.5" cy="27" r="4" />
          <line x1="48.5" y1="27" x2="51.5" y2="27" />
        </g>
      )}
      {/* 帽 */}
      {o.accessories.includes("cap") && (
        <>
          <path d="M35 20 Q35 7 50 7 Q65 7 65 20 Z" fill="#B91C1C" />
          <path d="M50 19 L74 21 L64 23 L50 21 Z" fill="#991B1B" />
        </>
      )}

      {unknown && (
        <text x="50" y="88" textAnchor="middle" fontSize="20" fill="#6B7280">?</text>
      )}
    </svg>
  );
}

export function describeOutfit(o: Outfit) {
  const c = (hex: string) => OUTFIT_COLORS.find((x) => x.hex === hex)?.label ?? "";
  const top = { tshirt: "T 恤", shirt: "恤衫", sweater: "冷衫" }[o.top.style];
  const bottom = { pants: "長褲", shorts: "短褲", skirt: "裙" }[o.bottom.style];
  const outer = o.outer.style === "none" ? "" : `${c(o.outer.color)}色${o.outer.style === "coat" ? "褸" : "外套"}・`;
  const acc = o.accessories.map((a) => ({ cap: "帽", glasses: "眼鏡", backpack: "背囊", handbag: "手袋" })[a]).join("、");
  return `${o.hair === "long" ? "長髮" : "短髮"}・${outer}${c(o.top.color)}色${top}・${c(o.bottom.color)}色${bottom}${acc ? `・${acc}` : ""}`;
}
