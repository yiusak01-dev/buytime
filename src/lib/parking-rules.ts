// Parse Hong Kong mall parking-rule strings and compute earned hours.
//
// Supported formats (from v_malls_active_rules.cond_wd / cond_we):
//   - "$200=1hr | $400=2hr"
//   - "$200=1hr / $400=2hr"
//   - "$200=1hr, $400=2hr"
//   - "單一$300=3hr"
//   - "每$100=1hr（最多5hr）"
//   - "每 $100 = 1hr (最多 5hr)"

export type ParkingRuleResult = {
  hours: number;
  minThreshold: number; // amount needed to earn any hours (0 if unknown)
  belowThreshold: boolean;
};

const EMPTY: ParkingRuleResult = { hours: 0, minThreshold: 0, belowThreshold: false };

function parseMaxHours(s: string): number | null {
  const m = s.match(/最多\s*(\d+(?:\.\d+)?)\s*hr/i);
  return m ? Number(m[1]) : null;
}

export function calcParkingHours(
  cond: string | null | undefined,
  amount: number,
): ParkingRuleResult {
  if (!cond || !amount || amount <= 0) return EMPTY;
  const text = String(cond).trim();
  const maxHours = parseMaxHours(text);

  // Per-unit pattern: "每$100=1hr" (with optional "最多Xhr")
  const perUnit = text.match(/每\s*\$?\s*(\d+(?:\.\d+)?)\s*=\s*(\d+(?:\.\d+)?)\s*hr/i);
  if (perUnit) {
    const unit = Number(perUnit[1]);
    const perHours = Number(perUnit[2]);
    if (unit <= 0) return EMPTY;
    if (amount < unit) {
      return { hours: 0, minThreshold: unit, belowThreshold: true };
    }
    let h = Math.floor(amount / unit) * perHours;
    if (maxHours != null) h = Math.min(h, maxHours);
    return { hours: h, minThreshold: unit, belowThreshold: false };
  }

  // Tier pattern: collect all "$THRESHOLD=Nhr" occurrences.
  const tierRegex = /\$?\s*(\d+(?:\.\d+)?)\s*=\s*(\d+(?:\.\d+)?)\s*hr/gi;
  const tiers: { threshold: number; hours: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = tierRegex.exec(text)) !== null) {
    tiers.push({ threshold: Number(m[1]), hours: Number(m[2]) });
  }
  if (tiers.length === 0) return EMPTY;
  tiers.sort((a, b) => a.threshold - b.threshold);
  const minThreshold = tiers[0].threshold;
  if (amount < minThreshold) {
    return { hours: 0, minThreshold, belowThreshold: true };
  }
  // pick highest tier where amount >= threshold
  let best = 0;
  for (const t of tiers) {
    if (amount >= t.threshold) best = t.hours;
  }
  if (maxHours != null) best = Math.min(best, maxHours);
  return { hours: best, minThreshold, belowThreshold: false };
}

export type MallParkingRule = {
  minSpendPerHour: number;
  maxParkingHours: number;
};

const DEFAULT_MAX_HOURS = 3;
const DEFAULT_MIN_SPEND = 50;

// Derive "每 X 元 = 1 小時" + 上限, from a mall rule string like
// "每$100=1hr（最多5hr）" or "$200=1hr / $400=2hr".
export function deriveMallRule(cond: string | null | undefined): MallParkingRule {
  const text = String(cond ?? "").trim();
  if (!text) return { minSpendPerHour: DEFAULT_MIN_SPEND, maxParkingHours: DEFAULT_MAX_HOURS };
  const maxHours = parseMaxHours(text);

  const perUnit = text.match(/每\s*\$?\s*(\d+(?:\.\d+)?)\s*=\s*(\d+(?:\.\d+)?)\s*hr/i);
  if (perUnit) {
    const unit = Number(perUnit[1]);
    const perHours = Number(perUnit[2]) || 1;
    return {
      minSpendPerHour: perHours > 0 ? unit / perHours : unit,
      maxParkingHours: maxHours ?? DEFAULT_MAX_HOURS,
    };
  }

  const tierRegex = /\$?\s*(\d+(?:\.\d+)?)\s*=\s*(\d+(?:\.\d+)?)\s*hr/gi;
  const tiers: { threshold: number; hours: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = tierRegex.exec(text)) !== null) {
    tiers.push({ threshold: Number(m[1]), hours: Number(m[2]) });
  }
  if (tiers.length === 0) {
    return { minSpendPerHour: DEFAULT_MIN_SPEND, maxParkingHours: maxHours ?? DEFAULT_MAX_HOURS };
  }
  tiers.sort((a, b) => a.threshold - b.threshold);
  const first = tiers[0];
  const topHours = Math.max(...tiers.map((t) => t.hours));
  return {
    minSpendPerHour: first.hours > 0 ? first.threshold / first.hours : first.threshold,
    maxParkingHours: maxHours ?? topHours ?? DEFAULT_MAX_HOURS,
  };
}
