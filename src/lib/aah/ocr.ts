/**
 * 讀收據／優惠券上面嘅金額。喺用戶部電話入面跑（tesseract.js），唔使上傳張相。
 * 讀唔準就由用戶自己改，所以只係「建議」，另外俾幾個讀到嘅金額撳嚟揀。
 */

export type OcrLine = { text: string; h: number };
export type OcrAmounts = {
  /** 最似總數嘅金額 */
  best: number | null;
  /** 讀到嘅其他金額（包括 best），最似嘅排先，最多 4 個 */
  options: number[];
};

/**
 * 收據嘅總數通常係大字，tesseract 喺大圖反而讀唔到大字（「$627.6」會讀成「$6」），
 * 細圖就讀得準大字但讀唔到細字；所以用兩個大細各讀一次，再合埋揀。
 */
const PASS_SIZES = [750, 1150];

export async function readAmountsFromImage(file: File): Promise<OcrAmounts> {
  const { createWorker, PSM } = await import("tesseract.js");
  const base = await prepareImage(file);
  const worker = await createWorker("eng");
  try {
    // 收據啲字好散：用「零散文字」模式先讀到
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const lines: OcrLine[] = [];
    const passes = base instanceof HTMLCanvasElement ? PASS_SIZES.map((n) => resizeCanvas(base, n)) : [{ image: base as File | HTMLCanvasElement, k: 1 }];
    for (const { image, k } of passes) {
      const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
      const before = lines.length;
      for (const b of data.blocks ?? [])
        for (const p of b.paragraphs)
          // 字高換返做原圖比例，兩次讀到嘅先可以比較
          for (const l of p.lines) lines.push({ text: l.text, h: Math.max(1, l.bbox.y1 - l.bbox.y0) / k });
      if (lines.length === before && data.text) for (const t of data.text.split(/\n+/)) lines.push({ text: t, h: 1 });
    }
    return pickAmounts(lines);
  } finally {
    await worker.terminate();
  }
}

/** 將圖縮到最長一邊 n px（細過就唔放大）；k = 新圖 / 原圖 */
function resizeCanvas(src: HTMLCanvasElement, n: number): { image: HTMLCanvasElement; k: number } {
  const k = Math.min(1, n / Math.max(src.width, src.height));
  if (k === 1) return { image: src, k };
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(src.width * k));
  c.height = Math.max(1, Math.round(src.height * k));
  const ctx = c.getContext("2d");
  if (!ctx) return { image: src, k: 1 };
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return { image: c, k };
}

/** 縮細（最長 2000px）、轉灰階、拉闊對比：張相暗或者偏色都讀得好啲 */
async function prepareImage(file: File): Promise<HTMLCanvasElement | File> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) {
      const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      d[i] = d[i + 1] = d[i + 2] = g;
      hist[g]++;
    }
    // 頭尾 2% 當黑白，中間拉闊
    const total = w * h;
    let lo = 0;
    let hi = 255;
    for (let acc = 0; lo < 255 && (acc += hist[lo]) < total * 0.02; ) lo++;
    for (let acc = 0; hi > 0 && (acc += hist[hi]) < total * 0.02; ) hi--;
    if (hi - lo > 10) {
      const k = 255 / (hi - lo);
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.max(0, Math.min(255, Math.round((d[i] - lo) * k)));
        d[i] = d[i + 1] = d[i + 2] = v;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  } catch {
    return file;
  }
}

const TOTAL_WORDS = /(total|amount\s*due|grand|net\s*amount|合計|總計|總額|總數|實付|應付|實收|付款金額)/i;
// $627.6、HK$ 1,280.00、S627（OCR 成日將 $ 讀成 S）；前面有「-」係折扣，唔要
const MONEY = /(^|[^\w.])(-?)\s*(?:HK\s*\$|\$|S(?=\d))\s*(\d{1,3}(?:,\d{3})+|\d{1,5})(?:[.](\d{1,2}))?(?![\d,])/gi;
// 冇 $ 號但有兩個位小數，例如 627.60
const DECIMAL = /(^|[^\w.,$\-])(\d{1,3}(?:,\d{3})+|\d{1,5})\.(\d{2})(?!\d)/g;

type Cand = { value: number; h: number; kw: boolean };

/** 由 OCR 讀到嘅每行字揀出最似「總數」嘅金額：有「總計」字眼 > 最大字 > 最大金額 */
export function pickAmounts(lines: OcrLine[]): OcrAmounts {
  const cands: Cand[] = [];
  for (const line of lines) {
    const text = line.text.trim();
    if (!text) continue;
    const kw = TOTAL_WORDS.test(text);
    for (const m of text.matchAll(MONEY)) {
      if (m[2] === "-") continue;
      const value = Number(m[3].replace(/,/g, "") + (m[4] ? `.${m[4]}` : ""));
      if (value > 0 && value < 100000) cands.push({ value, h: line.h, kw });
    }
    for (const m of text.matchAll(DECIMAL)) {
      const value = Number(`${m[2].replace(/,/g, "")}.${m[3]}`);
      if (value > 0 && value < 100000 && !cands.some((c) => c.value === value && c.h === line.h)) cands.push({ value, h: line.h, kw });
    }
  }
  if (!cands.length) return { best: null, options: [] };

  const hs = cands.map((c) => c.h).sort((a, b) => a - b);
  const median = hs[Math.floor(hs.length / 2)] || 1;
  const score = (c: Cand) => (c.kw ? 100 : 0) + (c.h >= median * 1.35 ? 40 * (c.h / median) : 0);

  const ranked = [...cands].sort((a, b) => score(b) - score(a) || b.value - a.value);
  // 同一個大字，一次讀到「$627」另一次讀到「$627.6」：用有小數嗰個
  for (let i = 0; i < ranked.length; i++) {
    const c = ranked[i];
    if (!Number.isInteger(c.value)) continue;
    const better = ranked.find((d) => !Number.isInteger(d.value) && Math.floor(d.value) === c.value && score(d) > 0);
    if (better && score(c) > 0) ranked[i] = { ...c, value: better.value };
  }
  const options: number[] = [];
  const top = ranked[0];
  for (const c of ranked) {
    // 總數係大字／有「總計」字眼時，大過佢 5 倍嘅多數係讀錯（例如「-$50.0 (折扣…」讀成 5030）
    if (score(top) > 0 && c !== top && c.value > top.value * 5) continue;
    const v = Math.round(c.value * 100) / 100;
    if (!options.includes(v)) options.push(v);
    if (options.length >= 4) break;
  }
  return { best: options[0] ?? null, options };
}

/** 舊介面：淨係要一個金額 */
export function pickAmount(text: string): number | null {
  return pickAmounts(text.split(/\n+/).map((t) => ({ text: t, h: 1 }))).best;
}

/** 顯示金額：627.6 → "627.6"；627 → "627" */
export function fmtAmount(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}
