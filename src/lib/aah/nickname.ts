/** 暱稱規則（同伺服器 aah__nickname_problem 一樣） */
export const NICKNAME_COOLDOWN_DAYS = 30;

export function nicknameProblem(name: string): string | null {
  const n = name.trim();
  if (!n) return "要填暱稱";
  if (/(啱啱好|官方|客服|管理員|管理员|系統|系统|admin|buytime|support)/i.test(n)) return "暱稱唔可以用「啱啱好」「官方」「客服」呢類字";
  if (/([0-9０-９][\s-]?){6,}/.test(n)) return "暱稱唔可以有 6 個或以上數字（唔好留電話）";
  return null;
}

/** 下次可以改暱稱嘅時間；可以即刻改就 null */
export function nextNicknameChangeAt(changedAt: number | undefined, now: number): number | null {
  if (!changedAt) return null;
  const next = changedAt + NICKNAME_COOLDOWN_DAYS * 24 * 3600 * 1000;
  return next > now ? next : null;
}
