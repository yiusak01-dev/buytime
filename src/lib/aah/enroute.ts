import type { Interest, Match, Post } from "./types";

/** 「我去緊」：可以揀幾多分鐘到 */
export const ETA_OPTIONS = [10, 20, 30] as const;
/** 要早過 post 過期時間幾多分鐘到 */
export const ETA_BUFFER_MIN = 5;
/** 過咗講好時間幾多分鐘，對方可以取消並重新放出 */
export const LATE_GRACE_MIN = 5;
/** 配對頭幾分鐘反悔唔計臨時取消 */
export const CANCEL_GRACE_MIN = 2;

const MIN = 60000;

/**
 * 而家取消會唔會記一次臨時取消（同伺服器一樣）：
 *  - 對方已經到咗，自己未到；或者
 *  - 去緊嘅配對：配對咗 2 分鐘之後，去緊嘅人仲未到（邊個取消都算）
 */
export function cancelIsLate(m: Match, me: string, now: number): boolean {
  const otherArrived = !m.arrived[me] && m.participants.some((p) => p.userId !== me && m.arrived[p.userId]);
  const enRoute = !!m.enRouteUser && now > m.createdAt + CANCEL_GRACE_MIN * MIN && !m.arrived[m.enRouteUser];
  return otherArrived || enRoute;
}

/** 呢個 post 接唔接去緊嘅人（夾單一律唔接） */
export function acceptsEnRoute(post: Post): boolean {
  return post.scenario !== "groupbuy" && post.acceptEnRoute !== false;
}

/** 而家揀得邊幾個到達時間（要早過過期前 5 分鐘） */
export function etaChoices(leaveAt: number, now: number): number[] {
  return ETA_OPTIONS.filter((m) => now + m * MIN <= leaveAt - ETA_BUFFER_MIN * MIN);
}

export function fmtKm(m?: number): string | null {
  if (m == null) return null;
  return m < 1000 ? `${Math.round(m / 10) * 10} 米` : `${(m / 1000).toFixed(1)} 公里`;
}

/**
 * 有興趣名單排先後：已喺場嘅排先（按撳嘅先後），之後去緊嘅（邊個快到邊個先）。
 */
export function sortInterests(list: Interest[]): Interest[] {
  const here = list.filter((i) => !i.enRoute).sort((a, b) => a.at - b.at);
  const coming = list.filter((i) => i.enRoute).sort((a, b) => (a.etaAt ?? Infinity) - (b.etaAt ?? Infinity));
  return [...here, ...coming];
}

/**
 * ⭐ 建議揀邊個：有人喺場就揀最早撳嘅喺場人；
 * 冇人喺場就揀最快到、冇出現過嘅人（全部都冇出現過就揀最快到嗰個）。
 * 價錢唔影響建議。
 */
export function suggestedInterest(list: Interest[]): Interest | undefined {
  const sorted = sortInterests(list);
  const here = sorted.find((i) => !i.enRoute);
  if (here) return here;
  return sorted.find((i) => !i.noShows) ?? sorted[0];
}
