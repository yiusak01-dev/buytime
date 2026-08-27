// Fee logic for 買時間 marketplace
// 碎單 / 1 小時：買賣各 flat HK$2.50
// 2 小時或以上：買賣各 10%，最低 HK$3

export const FLAT_FEE = 2.5;
export const FEE_PCT = 0.10;
export const MIN_PCT_FEE = 3;

export function isFlatFee(hours: number): boolean {
  return hours <= 1;
}

export function feePct(hours: number): number {
  return isFlatFee(hours) ? 0 : FEE_PCT;
}

export function feeLabel(hours: number): string {
  return isFlatFee(hours) ? "固定 HK$2.5" : "10%";
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function calcFees(listingPrice: number, hours: number) {
  const flat = isFlatFee(hours);
  const fee = flat
    ? FLAT_FEE
    : Math.max(MIN_PCT_FEE, round2(listingPrice * FEE_PCT));
  const buyerFee = fee;
  const sellerFee = fee;
  return {
    pct: feePct(hours),
    flat,
    label: feeLabel(hours),
    buyerFee,
    sellerFee,
    buyerTotal: round2(listingPrice + buyerFee),
    sellerPayout: round2(listingPrice - sellerFee),
    platformFee: round2(buyerFee + sellerFee),
  };
}

export function calcSavings(hourlyRate: number, hours: number, listingPrice: number): number {
  return Math.round((hourlyRate * hours - listingPrice) * 100) / 100;
}

export function formatHKD(n: number): string {
  return `HK$${n.toFixed(n % 1 === 0 ? 0 : 2)}`;
}
