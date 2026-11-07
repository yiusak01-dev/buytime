import type { CurrentMall } from "./geo";
import { nearbyMalls } from "./malls";
import { SCENARIOS } from "./scenarios";
import { testLocationAllowed } from "./store";
import type { AahMall, Post } from "./types";

/** 而家撳唔撳得「有興趣」：要 GPS 確認喺同一個商場（置頂推到附近商場嘅都得，泊車除外） */
export function canActOn(post: Post, current: CurrentMall, malls: AahMall[]): boolean {
  if (!current.mall || (current.test && !testLocationAllowed())) return false;
  if (current.mall.id === post.mallId) return true;
  const mall = malls.find((m) => m.id === post.mallId);
  if (!SCENARIOS[post.scenario].pushNearby || !mall) return false;
  return nearbyMalls(malls, mall).some((m) => m.id === current.mall!.id);
}

/** 個掣叫咩 */
export function actWord(post: Post): string {
  if (post.scenario === "groupbuy") return "我夾";
  if (post.direction === "want") return "我有";
  return "有興趣";
}
