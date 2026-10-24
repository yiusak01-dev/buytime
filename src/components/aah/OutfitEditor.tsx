import { useState } from "react";
import type { Outfit } from "@/lib/aah/types";
import { Avatar, DEFAULT_OUTFIT, OUTFIT_COLORS, describeOutfit } from "./Avatar";
import { Chip } from "./ui";
import { cn } from "@/lib/utils";

function Swatches({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {OUTFIT_COLORS.map((c) => (
        <button
          key={c.hex}
          type="button"
          aria-label={c.label}
          onClick={() => onChange(c.hex)}
          className={cn("w-8 h-8 rounded-full border-2", value === c.hex ? "border-[#1a1a1a] scale-110" : "border-border")}
          style={{ background: c.hex }}
        />
      ))}
    </div>
  );
}

/** 揀今日打扮：撳選，唔使拖拉，三四下搞掂 */
export function OutfitEditor({ initial, onSave }: { initial?: Outfit | null; onSave: (o: Outfit) => void }) {
  const [o, setO] = useState<Outfit>(initial ?? DEFAULT_OUTFIT);
  const toggleAcc = (a: Outfit["accessories"][number]) =>
    setO((x) => ({ ...x, accessories: x.accessories.includes(a) ? x.accessories.filter((y) => y !== a) : [...x.accessories, a] }));

  return (
    <div className="space-y-4 pb-2">
      <div className="flex items-center gap-4 bg-accent/60 rounded-2xl p-3">
        <Avatar outfit={o} size={70} />
        <div className="text-xs text-muted-foreground leading-relaxed">{describeOutfit(o)}</div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-bold">髮型</div>
        <div className="flex gap-2">
          <Chip active={o.hair === "long"} onClick={() => setO({ ...o, hair: "long" })}>長髮</Chip>
          <Chip active={o.hair === "short"} onClick={() => setO({ ...o, hair: "short" })}>短髮</Chip>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-bold">上身</div>
        <div className="flex gap-2">
          {(["tshirt", "shirt", "sweater"] as const).map((s) => (
            <Chip key={s} active={o.top.style === s} onClick={() => setO({ ...o, top: { ...o.top, style: s } })}>
              {{ tshirt: "T 恤", shirt: "恤衫", sweater: "冷衫" }[s]}
            </Chip>
          ))}
        </div>
        <Swatches value={o.top.color} onChange={(hex) => setO({ ...o, top: { ...o.top, color: hex } })} />
      </div>

      <div className="space-y-2">
        <div className="text-sm font-bold">下身</div>
        <div className="flex gap-2">
          {(["pants", "shorts", "skirt"] as const).map((s) => (
            <Chip key={s} active={o.bottom.style === s} onClick={() => setO({ ...o, bottom: { ...o.bottom, style: s } })}>
              {{ pants: "長褲", shorts: "短褲", skirt: "裙" }[s]}
            </Chip>
          ))}
        </div>
        <Swatches value={o.bottom.color} onChange={(hex) => setO({ ...o, bottom: { ...o.bottom, color: hex } })} />
      </div>

      <div className="space-y-2">
        <div className="text-sm font-bold">外套</div>
        <div className="flex gap-2">
          {(["none", "coat", "jacket"] as const).map((s) => (
            <Chip key={s} active={o.outer.style === s} onClick={() => setO({ ...o, outer: { ...o.outer, style: s } })}>
              {{ none: "冇", coat: "褸", jacket: "外套" }[s]}
            </Chip>
          ))}
        </div>
        {o.outer.style !== "none" && <Swatches value={o.outer.color} onChange={(hex) => setO({ ...o, outer: { ...o.outer, color: hex } })} />}
      </div>

      <div className="space-y-2">
        <div className="text-sm font-bold">配件</div>
        <div className="flex flex-wrap gap-2">
          {(["cap", "glasses", "backpack", "handbag"] as const).map((a) => (
            <Chip key={a} active={o.accessories.includes(a)} onClick={() => toggleAcc(a)}>
              {{ cap: "帽", glasses: "眼鏡", backpack: "背囊", handbag: "手袋" }[a]}
            </Chip>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onSave(o)}
        className="w-full h-12 rounded-2xl bg-[#1a1a1a] text-white font-bold"
      >
        就咁著
      </button>
      <p className="text-[11px] text-muted-foreground text-center">今日之內嘅配對會自動用返呢套打扮，聽日自動清空。</p>
    </div>
  );
}
