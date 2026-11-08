/**
 * 裝置號碼：app 第一次開嗰陣自己整嘅隨機號碼，存喺呢部機。
 * 唔係廣告 ID、唔係電話號碼；用嚟睇同一部機開咗幾多個帳戶（防濫用），同埋將用法紀錄唔記名噉分組。
 */
const DEVICE_KEY = "aah:device";
let cached: string | null = null;

export function deviceId(): string | null {
  if (cached) return cached;
  if (typeof window === "undefined") return null;
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id || !/^[A-Za-z0-9-]{8,64}$/.test(id)) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    cached = id;
    return id;
  } catch {
    return null;
  }
}

export function platformName(): string {
  try {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    return cap?.getPlatform?.() ?? "web";
  } catch {
    return "web";
  }
}
