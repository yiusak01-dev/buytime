/**
 * 讀收據／優惠券上面嘅金額。喺用戶部電話入面跑（tesseract.js），唔使上傳張相。
 * 讀唔準就由用戶自己改，所以只係「建議」。
 */
export async function readAmountFromImage(file: File): Promise<number | null> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(file);
    return pickAmount(data.text ?? "");
  } finally {
    await worker.terminate();
  }
}

/** 由 OCR 文字揀出最似「總數」嘅金額 */
export function pickAmount(text: string): number | null {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const num = /(?:HK\$|\$)?\s*(\d{1,5}(?:,\d{3})*(?:\.\d{1,2})?)/g;
  const parse = (s: string) => Number(s.replace(/,/g, ""));

  const totalLine = lines.find((l) => /(total|amount|合計|總計|總額|實付|應付)/i.test(l));
  if (totalLine) {
    const nums = [...totalLine.matchAll(num)].map((m) => parse(m[1])).filter((n) => n > 0 && n < 100000);
    if (nums.length) return Math.round(Math.max(...nums));
  }
  // 冇「總數」字眼：揀有小數點或者 $ 號嘅最大數字
  const candidates: number[] = [];
  for (const l of lines) {
    for (const m of l.matchAll(num)) {
      const raw = m[0];
      const n = parse(m[1]);
      if ((raw.includes("$") || /\.\d{2}$/.test(m[1])) && n > 0 && n < 100000) candidates.push(n);
    }
  }
  return candidates.length ? Math.round(Math.max(...candidates)) : null;
}
