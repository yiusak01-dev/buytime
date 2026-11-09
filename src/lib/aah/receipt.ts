import type { AahMall } from "./types";

/**
 * 影單據之後檢查：
 * - 日期：讀到日期唔係今日（香港時間）就唔俾放（商場一般只收即日單據）；讀唔到就提醒
 * - 舖頭：張單係咪呢個商場嘅舖（淨係提醒，唔阻止，因為可能係我哋名單未齊或者讀錯）
 */

export type ReceiptDateCheck =
  | { status: "today"; iso: string }
  | { status: "other"; iso: string; label: string }
  | { status: "unknown" };

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12,
};

type Ymd = { y: number; m: number; d: number };

function valid({ y, m, d }: Ymd): boolean {
  if (y < 2020 || y > 2040 || m < 1 || m > 12 || d < 1) return false;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= days;
}
const fullYear = (y: number) => (y < 100 ? 2000 + y : y);
const iso = ({ y, m, d }: Ymd) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** 香港時間今日 */
export function hkToday(now = Date.now()): Ymd {
  const t = new Date(now + 8 * 3600_000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/**
 * 由單據文字搵出所有日期；每個日期可能有幾個讀法（例如 09/11/26 可以係 11 月 9 日或者 9 月 11 日），
 * 全部列出嚟，之後只要有一個讀法係今日就當今日。
 */
export function receiptDateCandidates(text: string): Ymd[][] {
  // OCR 成日將 O 讀成 0 之外，亦會將「-」讀成「~」，先清一清
  const t = text.toUpperCase().replace(/[~—–]/g, "-");
  const out: Ymd[][] = [];
  const push = (opts: Ymd[]) => {
    const ok = opts.filter(valid);
    if (ok.length) out.push(ok);
  };
  // 2026-11-09、2026/11/09、2026.11.09、2026年11月9日
  for (const m of t.matchAll(/(?<!\d)(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})(?!\d)/g))
    push([{ y: +m[1], m: +m[2], d: +m[3] }]);
  // 09/11/2026、09-11-26：香港多數係日/月，美國機會係月/日，兩個都試；兩位數年份亦可能係年/月/日
  for (const m of t.matchAll(/(?<![\d/.-])(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{2}|20\d{2})(?![\d/.-])/g)) {
    const a = +m[1], b = +m[2], c = +m[3];
    const y = fullYear(c);
    const opts: Ymd[] = [{ y, m: b, d: a }, { y, m: a, d: b }];
    if (m[3].length === 2) opts.push({ y: fullYear(a), m: b, d: c });
    push(opts);
  }
  // 09 NOV 2026、09-NOV-26、09NOV26
  for (const m of t.matchAll(/(?<!\d)(\d{1,2})\s*[- ]?\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEPT?|OCT|NOV|DEC)[A-Z]*\.?\s*[- ,]?\s*(20\d{2}|\d{2})(?!\d)/g))
    push([{ y: fullYear(+m[3]), m: MONTHS[m[2]], d: +m[1] }]);
  // NOV 09, 2026、NOV 9 2026
  for (const m of t.matchAll(/(?<![A-Z])(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEPT?|OCT|NOV|DEC)[A-Z]*\.?\s*(\d{1,2}),?\s*(20\d{2})(?!\d)/g))
    push([{ y: +m[3], m: MONTHS[m[1]], d: +m[2] }]);
  return out;
}

export function checkReceiptDate(text: string, now = Date.now()): ReceiptDateCheck {
  const today = hkToday(now);
  const same = (a: Ymd) => a.y === today.y && a.m === today.m && a.d === today.d;
  const found = receiptDateCandidates(text);
  if (!found.length) return { status: "unknown" };
  if (found.some((opts) => opts.some(same))) return { status: "today", iso: iso(today) };
  const first = found[0][0];
  return { status: "other", iso: iso(first), label: `${first.y} 年 ${first.m} 月 ${first.d} 日` };
}

/* ================= 舖頭 ================= */

export type MallShop = { name: string; nameEn?: string | null; category?: string | null };

/** 舖名比較：唔理大細楷、全形半形、空格同標點；拎走括號入面嘅分店名 */
export function normShop(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[(（[【].*?[)）\]】]/g, "")
    .replace(/[\s\u3000'’`.,，。·・&＆\-_/|:：!！]+/g, "");
}

/** 打嘅舖名喺唔喺商場名單（兩邊互相包含都當係）；太短嘅唔判斷 */
export function shopInList(name: string, shops: MallShop[]): boolean {
  const n = normShop(name);
  if (n.length < 2 || !shops.length) return true;
  return shops.some((s) =>
    [s.name, s.nameEn].some((x) => {
      const k = normShop(x);
      return k.length >= 2 && (k.includes(n) || n.includes(k));
    }),
  );
}

/** 打緊字時俾幾個名單入面嘅名揀 */
export function shopMatches(input: string, shops: MallShop[], limit = 4): MallShop[] {
  const n = normShop(input);
  if (!n) return [];
  return shops.filter((s) => normShop(s.name).includes(n) || normShop(s.nameEn).includes(n)).slice(0, limit);
}

/** 喺單據文字入面搵商場名單入面嘅舖（英文名最少 4 個字母、中文名最少 2 個字先算，免得亂撞） */
export function findShopInText(text: string, shops: MallShop[]): MallShop | null {
  const t = normShop(text);
  let best: { s: MallShop; len: number } | null = null;
  for (const s of shops)
    for (const x of [s.nameEn, s.name]) {
      const k = normShop(x);
      const latin = /^[a-z0-9]+$/.test(k);
      if (k.length < (latin ? 4 : 2) || !t.includes(k)) continue;
      if (!best || k.length > best.len) best = { s, len: k.length };
    }
  return best?.s ?? null;
}

/** 商場嘅英文／中文別名，例如「海港城 (Harbour City)」→ 海港城、harbourcity */
function mallAliases(m: AahMall): string[] {
  const out = new Set<string>();
  const raw = m.name;
  const inner = /[(（]([^)）]+)[)）]/.exec(raw)?.[1];
  const outer = raw.replace(/[(（][^)）]*[)）]/g, "");
  for (const x of [outer, inner]) {
    const k = normShop(x);
    const latin = /^[a-z0-9]+$/.test(k);
    if (k.length >= (latin ? 5 : 3)) out.add(k);
  }
  return [...out];
}

/** 單據上面印咗另一個商場個名（例如身處 APM，張單寫住「馬鞍山廣場」） */
export function findOtherMallInText(text: string, malls: AahMall[], current: AahMall | null | undefined): AahMall | null {
  const t = normShop(text);
  if (current && mallAliases(current).some((a) => t.includes(a))) return null;
  for (const m of malls) {
    if (m.id === current?.id) continue;
    if (mallAliases(m).some((a) => t.includes(a))) return m;
  }
  return null;
}
