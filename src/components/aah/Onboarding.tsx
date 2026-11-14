import { useState, type ReactNode } from "react";
import { Camera, Hand, MapPin } from "lucide-react";
import { CatIcon } from "./CatIcon";
import { aah } from "@/lib/aah/store";
import { geoStore } from "@/lib/aah/geo";
import { VERBS } from "@/lib/aah/theme";
import type { ScenarioId } from "@/lib/aah/types";

export const HOW_KEY = "aah:howSeen";

export function readHowSeen(): boolean {
  try {
    return localStorage.getItem(HOW_KEY) === "1";
  } catch {
    return false;
  }
}

const CATS: ScenarioId[] = ["parking", "dining", "offer", "groupbuy"];

type Page = { title: string; sub: string; art: () => ReactNode; bg: string };

const PAGES: Page[] = [
  {
    title: "喺商場，用唔着嘅唔好嘥",
    sub: "泊車單、排隊飛、優惠券、夾單，即場交換",
    bg: "#FFF4EC",
    art: () => (
      <div className="grid grid-cols-2 gap-4">
        {CATS.map((c) => (
          <CatIcon key={c} scenario={c} size={84} />
        ))}
      </div>
    ),
  },
  {
    title: "搵：想要就撳「有興趣」",
    sub: "人哋放出嚟嘅，你喺商場就攞到",
    bg: VERBS.find.soft,
    art: () => (
      <span
        className="w-40 h-40 rounded-full grid place-items-center text-white"
        style={{ background: VERBS.find.strong }}
      >
        <Hand className="w-20 h-20" strokeWidth={1.8} />
      </span>
    ),
  },
  {
    title: "放：用唔着就影相放出去",
    sub: "有人要，喺商場見面交收",
    bg: VERBS.give.soft,
    art: () => (
      <span
        className="w-40 h-40 rounded-full grid place-items-center text-white"
        style={{ background: VERBS.give.strong }}
      >
        <Camera className="w-20 h-20" strokeWidth={1.8} />
      </span>
    ),
  },
  {
    title: "開定位，搵你身處嘅商場",
    sub: "知道你喺邊個商場，先可以同身邊嘅人交換",
    bg: "#E3F5EA",
    art: () => (
      <span className="w-40 h-40 rounded-full grid place-items-center text-white bg-[#1FA463]">
        <MapPin className="w-20 h-20" strokeWidth={1.8} />
      </span>
    ),
  },
];

/** 第一次開 app：全畫面 4 頁，撳「下一步」行晒先入首頁；最後一頁問定位 */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const page = PAGES[i];
  const last = i === PAGES.length - 1;

  function finish() {
    try {
      localStorage.setItem(HOW_KEY, "1");
    } catch {
      /* 私隱模式：唔記得都冇問題 */
    }
    aah.updateUser({ onboarded: true });
    void geoStore.start();
    onDone();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="點樣用啱啱好"
      data-testid="onboarding"
      className="fixed inset-0 z-[90] flex flex-col transition-colors duration-300"
      style={{ background: page.bg }}
    >
      <div className="max-w-lg w-full mx-auto flex-1 flex flex-col px-6 pt-[max(env(safe-area-inset-top),20px)] pb-[max(env(safe-area-inset-bottom),20px)]">
        <div className="flex gap-1.5 pt-2" aria-label={`第 ${i + 1} 頁，共 ${PAGES.length} 頁`}>
          {PAGES.map((_, k) => (
            <span
              key={k}
              className="h-1.5 flex-1 rounded-full transition-colors duration-300"
              style={{ background: k <= i ? "#2B2433" : "rgba(43,36,51,0.15)" }}
            />
          ))}
        </div>

        <div
          key={i}
          className="flex-1 flex flex-col items-center justify-center text-center gap-8 animate-in fade-in slide-in-from-right-6 duration-300"
        >
          {page.art()}
          <div className="space-y-2.5">
            <h1 className="text-[26px] font-black leading-tight">{page.title}</h1>
            <p className="text-[16px] font-bold text-[#5E5568]">{page.sub}</p>
          </div>
        </div>

        <div className="flex gap-2.5">
          {i > 0 && (
            <button
              type="button"
              onClick={() => setI(i - 1)}
              className="h-14 px-5 rounded-[20px] bg-white/70 text-base font-black"
            >
              返回
            </button>
          )}
          <button
            type="button"
            onClick={() => (last ? finish() : setI(i + 1))}
            className="h-14 flex-1 rounded-[20px] bg-[#2B2433] text-white text-base font-black active:scale-[0.98] transition-transform"
          >
            {last ? "開始用" : "下一步"}
          </button>
        </div>
      </div>
    </div>
  );
}
