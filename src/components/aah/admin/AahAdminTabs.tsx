import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCcw, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/**
 * 啱啱好 admin：申訴、舉報、設定、可疑帳戶、用家意見、禮券、操作紀錄。
 * 讀寫 aah_* 資料表（見 supabase/migrations/20261025*）。所有決定經 security definer function，
 * function 入面會再檢查 admin 身份同記低操作紀錄。
 */

const sb = () => supabase as any;

type Profile = {
  id: string;
  nickname: string | null;
  phone: string | null;
  points: number;
  completed: number;
  no_shows: number;
  warnings: number;
  banned_until: string | null;
  created_at: string;
};

function friendlyError(e: any): string {
  const msg = String(e?.message ?? e ?? "");
  if (/aah_|relation .* does not exist|schema cache|PGRST20/i.test(msg)) {
    return "啱啱好資料表未建立。請先喺 Supabase SQL Editor 執行 supabase/migrations 入面 20261025 開頭嗰兩個檔。";
  }
  return msg || "讀取失敗";
}

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("zh-HK", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Hong_Kong" }) : "—";
const maskPhone = (p?: string | null) => (p ? p.replace(/(\+852)(\d{4})(\d{4})/, "$1 $2 ••••") : "—");
const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
const nameOf = (m: Map<string, Profile>, id?: string | null) => (id ? m.get(id)?.nickname ?? id.slice(0, 6) : "—");

async function fetchProfiles(ids: (string | null | undefined)[]) {
  const uniq = Array.from(new Set(ids.filter(Boolean))) as string[];
  if (uniq.length === 0) return new Map<string, Profile>();
  const { data, error } = await sb()
    .from("aah_profiles")
    .select("id, nickname, phone, points, completed, no_shows, warnings, banned_until, created_at")
    .in("id", uniq);
  if (error) throw error;
  return new Map<string, Profile>((data ?? []).map((p: Profile) => [p.id, p]));
}

function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fn());
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    void load();
  }, [load]);
  return { data, error, loading, reload: load };
}

function Toolbar({ onReload, children }: { onReload: () => void; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="flex-1 flex gap-2 overflow-x-auto">{children}</div>
      <button onClick={onReload} aria-label="重新載入" className="w-9 h-9 grid place-items-center rounded-lg border border-border">
        <RefreshCcw className="w-4 h-4" />
      </button>
    </div>
  );
}

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="inline-flex rounded-lg border border-border p-0.5">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} className={cn("px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap", value === v ? "bg-foreground text-background" : "text-muted-foreground")}>
          {l}
        </button>
      ))}
    </div>
  );
}

function StateBox({ loading, error, empty }: { loading: boolean; error: string | null; empty: boolean }) {
  if (loading) return <div className="py-10 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  if (error) return <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm p-4 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{error}</div>;
  if (empty) return <div className="rounded-xl bg-card text-sm text-muted-foreground p-6 text-center">冇嘢要處理</div>;
  return null;
}

function UserLine({ p, label }: { p?: Profile; label: string }) {
  if (!p) return <div className="text-xs text-muted-foreground">{label}：—</div>;
  const banned = p.banned_until && new Date(p.banned_until).getTime() > Date.now();
  return (
    <div className="text-xs">
      <span className="text-muted-foreground">{label}：</span>
      <b>{p.nickname ?? "（冇暱稱）"}</b> <span className="text-muted-foreground">{maskPhone(p.phone)}</span>
      <div className="text-muted-foreground mt-0.5">
        完成 {p.completed} 次・冇出現 {p.no_shows} 次・警告 {p.warnings} 次・帳戶 {daysSince(p.created_at)} 日
        {banned && <span className="text-red-600 font-semibold">・停用到 {fmt(p.banned_until)}</span>}
      </div>
    </div>
  );
}

/** 決定前要確認，並且可以寫備註（會記入操作紀錄） */
function DecideBar({ actions, onDecide, busy }: { actions: { key: string; label: string; tone: "danger" | "primary" | "neutral" }[]; onDecide: (key: string, note: string) => Promise<void>; busy: boolean }) {
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const chosen = actions.find((a) => a.key === confirm);
  return (
    <div className="space-y-2 pt-2 border-t border-border">
      <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder="備註（會記入操作紀錄）" className="w-full min-h-16 rounded-lg border border-border bg-background p-2 text-sm outline-none" />
      {confirm ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 text-sm">確定「{chosen?.label}」？</div>
          <button disabled={busy} onClick={async () => { await onDecide(confirm, note); setConfirm(null); }} className="h-9 px-3 rounded-lg bg-foreground text-background text-sm font-bold disabled:opacity-50">
            {busy ? "處理緊…" : "確定"}
          </button>
          <button onClick={() => setConfirm(null)} className="h-9 px-3 rounded-lg border border-border text-sm">取消</button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <button
              key={a.key}
              onClick={() => setConfirm(a.key)}
              className={cn(
                "h-9 px-3 rounded-lg text-sm font-semibold",
                a.tone === "danger" && "bg-red-600 text-white",
                a.tone === "primary" && "bg-[#2E9E6A] text-white",
                a.tone === "neutral" && "border border-border",
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- 配對時間線 + 對話 ---------------- */

type MatchBundle = {
  match: any;
  participants: any[];
  messages: any[];
};

async function fetchMatchBundle(matchId: string): Promise<MatchBundle> {
  const [m, parts, msgs] = await Promise.all([
    sb().from("aah_matches").select("*").eq("id", matchId).maybeSingle(),
    sb().from("aah_match_participants").select("*").eq("match_id", matchId),
    sb().from("aah_messages").select("*").eq("match_id", matchId).order("created_at"),
  ]);
  for (const r of [m, parts, msgs]) if (r.error) throw r.error;
  return { match: m.data, participants: parts.data ?? [], messages: msgs.data ?? [] };
}

function MatchTimeline({ bundle, extra }: { bundle: MatchBundle; extra: { at: string; text: string; tone?: "bad" }[] }) {
  const { match, participants, messages } = bundle;
  const names = new Map<string, string>(participants.map((p: any) => [p.user_id, p.display_name]));
  if (!match) return <div className="text-xs text-muted-foreground">搵唔到配對資料</div>;
  const events: { at: string; text: string; tone?: "bad" | "good" }[] = [
    { at: match.created_at, text: `配對成立：${match.shop}（${match.mall_name}）${match.price != null ? `・$${match.price}` : "・夾單"}` },
    ...participants.filter((p: any) => p.confirmed_at).map((p: any) => ({ at: p.confirmed_at, text: `${p.display_name} 確認見面（已顯示冇出現警告）` })),
    { at: match.meet_at, text: `約定見面：${match.meet_place}` },
    ...participants.filter((p: any) => p.arrived_at).map((p: any) => ({ at: p.arrived_at, text: `${p.display_name} 撳「我到咗」（GPS 喺場）`, tone: "good" as const })),
    ...extra,
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const notArrived = participants.filter((p: any) => !p.arrived_at).map((p: any) => p.display_name);

  return (
    <div className="space-y-3">
      <ol className="relative border-l border-border ml-1.5 space-y-2">
        {events.map((e, i) => (
          <li key={i} className="ml-3">
            <span className={cn("absolute -left-[5px] w-2.5 h-2.5 rounded-full mt-1", e.tone === "bad" ? "bg-red-500" : e.tone === "good" ? "bg-[#2E9E6A]" : "bg-muted-foreground")} />
            <div className="text-[11px] text-muted-foreground">{fmt(e.at)}</div>
            <div className="text-sm">{e.text}</div>
          </li>
        ))}
      </ol>
      {notArrived.length > 0 && <div className="text-xs text-red-700">冇撳「我到咗」：{notArrived.join("、")}</div>}
      <div className="rounded-lg bg-accent/50 p-2 space-y-1 max-h-60 overflow-y-auto">
        <div className="text-[11px] font-bold text-muted-foreground">對話紀錄（{messages.length}）</div>
        {messages.length === 0 && <div className="text-xs text-muted-foreground">冇訊息</div>}
        {messages.map((m: any) => (
          <div key={m.id} className="text-xs">
            <span className="text-muted-foreground">{fmt(m.created_at)}</span>{" "}
            <b>{m.from_id ? names.get(m.from_id) ?? "？" : "系統"}</b>：{m.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function Expand({ title, children }: { title: React.ReactNode; children: () => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between text-xs font-semibold text-primary py-1">
        {title}
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && <div className="pt-2">{children()}</div>}
    </div>
  );
}

function LazyMatch({ matchId, extra }: { matchId: string; extra: { at: string; text: string; tone?: "bad" }[] }) {
  const { data, error, loading } = useLoad(() => fetchMatchBundle(matchId), [matchId]);
  if (loading) return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
  if (error || !data) return <div className="text-xs text-red-700">{error}</div>;
  return <MatchTimeline bundle={data} extra={extra} />;
}

/* ================= 申訴 ================= */

export function AahAppealsTab() {
  const [filter, setFilter] = useState<"pending" | "done">("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const { data, error, loading, reload } = useLoad(async () => {
    let q = sb().from("aah_appeals").select("*").order("created_at", { ascending: filter === "pending" }).limit(100);
    q = filter === "pending" ? q.eq("status", "pending") : q.neq("status", "pending");
    const { data: appeals, error: e1 } = await q;
    if (e1) throw e1;
    const reportIds = (appeals ?? []).map((a: any) => a.report_id).filter(Boolean);
    const { data: reports, error: e2 } = reportIds.length ? await sb().from("aah_reports").select("*").in("id", reportIds) : { data: [], error: null };
    if (e2) throw e2;
    const rMap = new Map<string, any>((reports ?? []).map((r: any) => [r.id, r]));
    const profiles = await fetchProfiles([...(appeals ?? []).map((a: any) => a.user_id), ...(reports ?? []).map((r: any) => r.reporter_id)]);
    return { appeals: appeals ?? [], rMap, profiles };
  }, [filter]);

  async function decide(appealId: string, approve: boolean, note: string) {
    setBusy(appealId);
    const { error: e } = await sb().rpc("aah_admin_decide_appeal", { p_appeal: appealId, p_approve: approve, p_note: note || null });
    setBusy(null);
    if (e) return void toast.error(friendlyError(e));
    toast.success(approve ? "已撤銷停用，還返扣咗嘅分" : "已維持停用");
    void reload();
  }

  return (
    <div>
      <Toolbar onReload={reload}>
        <Seg value={filter} onChange={setFilter} options={[["pending", "待處理"], ["done", "已處理"]]} />
      </Toolbar>
      <p className="text-xs text-muted-foreground mb-3">
        冇出現由系統自動停用 30 日（對方撳咗「我到咗」、GPS 核實、被告冇到）。呢度只處理被停用嘅人喺 48 小時內提交嘅申訴。
      </p>
      <StateBox loading={loading} error={error} empty={!!data && data.appeals.length === 0} />
      <div className="space-y-3">
        {data?.appeals.map((a: any) => {
          const r = data.rMap.get(a.report_id);
          return (
            <div key={a.id} className="bg-card rounded-xl p-4 space-y-3 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">申訴・{fmt(a.created_at)}</div>
                <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded-full", a.status === "pending" ? "bg-amber-100 text-amber-800" : a.status === "approved" ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground")}>
                  {a.status === "pending" ? "待處理" : a.status === "approved" ? "已撤銷" : "維持停用"}
                </span>
              </div>
              <UserLine p={data.profiles.get(a.user_id)} label="申訴人（被停用）" />
              <UserLine p={r ? data.profiles.get(r.reporter_id) : undefined} label="報告人" />
              <div className="text-sm bg-accent/50 rounded-lg p-3">「{a.text}」</div>
              {r?.match_id && (
                <Expand title="睇配對時間線同對話">
                  {() => (
                    <LazyMatch
                      matchId={r.match_id}
                      extra={[
                        { at: r.created_at, text: `${nameOf(data.profiles, r.reporter_id)} 報告對方冇出現 → 系統停用 30 日`, tone: "bad" },
                        { at: a.created_at, text: "提交申訴" },
                      ]}
                    />
                  )}
                </Expand>
              )}
              {a.status === "pending" && (
                <DecideBar
                  busy={busy === a.id}
                  actions={[
                    { key: "approve", label: "撤銷停用（還返扣咗嘅分）", tone: "primary" },
                    { key: "reject", label: "維持停用", tone: "neutral" },
                  ]}
                  onDecide={(k, note) => decide(a.id, k === "approve", note)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================= 舉報 ================= */

const KIND_LABEL: Record<string, string> = {
  noshow: "冇出現",
  prepay: "要求預先轉數",
  harass: "騷擾",
  fake: "單據／飛／券係假",
  scalping: "炒飛／私下加價",
  other: "其他",
};

export function AahReportsTab() {
  const [filter, setFilter] = useState<"open" | "done" | "noshow">("open");
  const [busy, setBusy] = useState<string | null>(null);
  const { data, error, loading, reload } = useLoad(async () => {
    let q = sb().from("aah_reports").select("*").order("created_at", { ascending: false }).limit(100);
    if (filter === "noshow") q = q.eq("kind", "noshow");
    else if (filter === "open") q = q.neq("kind", "noshow").eq("status", "open");
    else q = q.neq("kind", "noshow").neq("status", "open");
    const { data: reports, error: e } = await q;
    if (e) throw e;
    const profiles = await fetchProfiles((reports ?? []).flatMap((r: any) => [r.reporter_id, r.accused_id]));
    // 同一個人被舉報幾多次
    const accusedIds = Array.from(new Set((reports ?? []).map((r: any) => r.accused_id)));
    const counts = new Map<string, number>();
    if (accusedIds.length) {
      const { data: all } = await sb().from("aah_reports").select("accused_id").in("accused_id", accusedIds);
      for (const x of all ?? []) counts.set(x.accused_id, (counts.get(x.accused_id) ?? 0) + 1);
    }
    // 被舉報嘅 post（唔使有配對都舉報得）
    const postIds = Array.from(new Set((reports ?? []).map((r: any) => r.post_id).filter(Boolean)));
    const posts = new Map<string, any>();
    if (postIds.length) {
      const { data: ps } = await sb().from("aah_posts").select("id, shop, mall_name, fields, status, author_name").in("id", postIds);
      for (const x of ps ?? []) posts.set(x.id, x);
    }
    return { reports: reports ?? [], profiles, counts, posts };
  }, [filter]);

  async function removePost(reportId: string, postId: string) {
    if (!window.confirm("移除呢個 post？會收埋 post 同清走備注，並通知發 post 嘅人。")) return;
    setBusy(reportId);
    const { error: e } = await sb().rpc("aah_admin_remove_post", { p_post: postId, p_note: null });
    setBusy(null);
    if (e) return void toast.error(friendlyError(e));
    toast.success("已移除 post");
    void reload();
  }

  async function decide(id: string, action: string, note: string) {
    setBusy(id);
    const { error: e } = await sb().rpc("aah_admin_decide_report", { p_report: id, p_action: action, p_note: note || null });
    setBusy(null);
    if (e) return void toast.error(friendlyError(e));
    toast.success(action === "ban" ? "已停用 30 日" : action === "warn" ? "已警告" : "已標記唔成立");
    void reload();
  }

  return (
    <div>
      <Toolbar onReload={reload}>
        <Seg value={filter} onChange={setFilter} options={[["open", "待處理"], ["done", "已處理"], ["noshow", "冇出現（自動）"]]} />
      </Toolbar>
      <p className="text-xs text-muted-foreground mb-3">
        平台唔經手錢，唔會追數或者退款。可以做嘅係警告、停用騙徒同保留紀錄；涉及詐騙請叫用戶報警，警方要求時提供紀錄。
      </p>
      <StateBox loading={loading} error={error} empty={!!data && data.reports.length === 0} />
      <div className="space-y-3">
        {data?.reports.map((r: any) => (
          <div key={r.id} className="bg-card rounded-xl p-4 space-y-3 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">{KIND_LABEL[r.kind] ?? r.kind}</span>
              <span className="text-xs text-muted-foreground">{fmt(r.created_at)}</span>
            </div>
            <UserLine p={data.profiles.get(r.accused_id)} label={`被舉報（共被舉報 ${data.counts.get(r.accused_id) ?? 1} 次）`} />
            <UserLine p={data.profiles.get(r.reporter_id)} label="舉報人" />
            {r.note && <div className="text-sm bg-accent/50 rounded-lg p-3">「{r.note}」</div>}
            {r.post_id && (() => {
              const p = data.posts.get(r.post_id);
              if (!p) return <div className="text-xs text-muted-foreground">被舉報嘅 post 已經唔存在</div>;
              const removed = p.status === "cancelled" && !p.fields?.remark && !p.fields?.deal;
              return (
                <div className="text-sm border border-border rounded-lg p-3 space-y-1">
                  <div className="font-semibold">被舉報嘅 post：{p.shop}・{p.mall_name}（{p.status}）</div>
                  {p.fields?.deal && <div>優惠：{String(p.fields.deal)}</div>}
                  {p.fields?.remark && <div>備注：{String(p.fields.remark)}</div>}
                  {!removed && (
                    <button
                      disabled={busy === r.id}
                      onClick={() => removePost(r.id, r.post_id)}
                      className="mt-1 h-9 px-3 rounded-lg bg-destructive text-destructive-foreground text-xs font-bold disabled:opacity-50"
                    >
                      移除呢個 post
                    </button>
                  )}
                </div>
              );
            })()}
            {r.match_id && (
              <Expand title="睇配對時間線同對話">
                {() => <LazyMatch matchId={r.match_id} extra={[{ at: r.created_at, text: `${nameOf(data.profiles, r.reporter_id)} 舉報：${KIND_LABEL[r.kind] ?? r.kind}`, tone: "bad" }]} />}
              </Expand>
            )}
            {r.status === "open" && r.kind !== "noshow" ? (
              <DecideBar
                busy={busy === r.id}
                actions={[
                  { key: "warn", label: "警告", tone: "neutral" },
                  { key: "ban", label: "停用 30 日", tone: "danger" },
                  { key: "dismiss", label: "唔成立", tone: "neutral" },
                ]}
                onDecide={(k, note) => decide(r.id, k, note)}
              />
            ) : (
              <div className="text-xs text-muted-foreground">
                {r.kind === "noshow" ? (r.status === "open" ? "系統已停用；如有申訴喺「申訴」處理" : r.status === "dismissed" ? "申訴成功，已撤銷" : "維持停用") : r.status === "upheld" ? "已處理：成立" : "已處理：唔成立"}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= 禮券批核 ================= */

export function AahVouchersTab() {
  const [filter, setFilter] = useState<"pending" | "done">("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const { data, error, loading, reload } = useLoad(async () => {
    let q = sb().from("aah_voucher_requests").select("*").order("created_at", { ascending: true }).limit(100);
    q = filter === "pending" ? q.eq("status", "pending") : q.neq("status", "pending");
    const { data: reqs, error: e } = await q;
    if (e) throw e;
    const userIds = (reqs ?? []).map((v: any) => v.user_id);
    const profiles = await fetchProfiles(userIds);
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: ledger, error: e2 } = userIds.length
      ? await sb().from("aah_point_ledger").select("user_id, partner_id, pts, reason, created_at").in("user_id", userIds).gte("created_at", since)
      : { data: [], error: null };
    if (e2) throw e2;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const { count: approvedThisMonth } = await sb()
      .from("aah_voucher_requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["approved", "sent"])
      .gte("created_at", monthStart.toISOString());
    return { reqs: reqs ?? [], profiles, ledger: ledger ?? [], approvedThisMonth: approvedThisMonth ?? 0 };
  }, [filter]);

  const risk = useMemo(() => {
    const out = new Map<string, { completes: number; partners: number; repeatedShare: number; flags: string[] }>();
    if (!data) return out;
    for (const v of data.reqs) {
      const rows = data.ledger.filter((l: any) => l.user_id === v.user_id && l.reason === "complete");
      const partners = new Set(rows.map((l: any) => l.partner_id).filter(Boolean));
      const counts = new Map<string, number>();
      for (const l of rows) if (l.partner_id) counts.set(l.partner_id, (counts.get(l.partner_id) ?? 0) + 1);
      const top = Math.max(0, ...counts.values());
      const repeatedShare = rows.length ? top / rows.length : 0;
      const p = data.profiles.get(v.user_id);
      const flags: string[] = [];
      if (p && daysSince(p.created_at) < 30) flags.push("帳戶未夠 30 日");
      if (rows.length >= 4 && repeatedShare >= 0.5) flags.push("一半以上交易都係同一個人");
      if (rows.length >= 4 && partners.size <= 2) flags.push("交易對象好少");
      if (p && p.no_shows > 0) flags.push(`冇出現 ${p.no_shows} 次`);
      out.set(v.id, { completes: rows.length, partners: partners.size, repeatedShare, flags });
    }
    return out;
  }, [data]);

  async function decide(id: string, approve: boolean, note: string) {
    setBusy(id);
    const { error: e } = await sb().rpc("aah_admin_decide_voucher", { p_request: id, p_approve: approve, p_note: note || null });
    setBusy(null);
    if (e) return void toast.error(friendlyError(e));
    toast.success(approve ? "已批准，記得寄出電子禮券" : "已拒絕，積分已退還");
    void reload();
  }

  return (
    <div>
      <Toolbar onReload={reload}>
        <Seg value={filter} onChange={setFilter} options={[["pending", "待批核"], ["done", "已處理"]]} />
      </Toolbar>
      {data && <p className="text-xs text-muted-foreground mb-3">本月已批 {data.approvedThisMonth} / 50 張。批核前睇清楚有冇呃分跡象；拒絕會自動退還積分。</p>}
      <StateBox loading={loading} error={error} empty={!!data && data.reqs.length === 0} />
      <div className="space-y-3">
        {data?.reqs.map((v: any) => {
          const r = risk.get(v.id);
          return (
            <div key={v.id} className="bg-card rounded-xl p-4 space-y-3 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">$50 百佳電子禮券・{v.points} 分</span>
                <span className="text-xs text-muted-foreground">{fmt(v.created_at)}</span>
              </div>
              <UserLine p={data.profiles.get(v.user_id)} label="申請人" />
              {r && (
                <div className="text-xs">
                  近 30 日完成 {r.completes} 次，同 {r.partners} 個唔同嘅人交易
                  {r.flags.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {r.flags.map((f) => <span key={f} className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-semibold">{f}</span>)}
                    </div>
                  ) : (
                    <div className="mt-1 text-[#2E9E6A] font-semibold">冇發現可疑</div>
                  )}
                </div>
              )}
              {v.status === "pending" ? (
                <DecideBar
                  busy={busy === v.id}
                  actions={[
                    { key: "approve", label: "批准", tone: "primary" },
                    { key: "reject", label: "拒絕（退還積分）", tone: "neutral" },
                  ]}
                  onDecide={(k, note) => decide(v.id, k === "approve", note)}
                />
              ) : (
                <div className="text-xs text-muted-foreground">{v.status === "rejected" ? "已拒絕" : v.status === "sent" ? "已寄出" : "已批准"}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================= 操作紀錄 ================= */

const ACTION_LABEL: Record<string, string> = {
  appeal_approve: "撤銷停用",
  appeal_reject: "維持停用",
  report_warn: "警告",
  report_ban: "停用 30 日",
  report_dismiss: "舉報唔成立",
  voucher_approve: "批准禮券",
  voucher_reject: "拒絕禮券",
};

export function AahAdminLogTab() {
  const { data, error, loading, reload } = useLoad(async () => {
    const { data: rows, error: e } = await sb().from("aah_admin_actions").select("*").order("created_at", { ascending: false }).limit(200);
    if (e) throw e;
    const profiles = await fetchProfiles((rows ?? []).map((r: any) => r.user_id));
    return { rows: rows ?? [], profiles };
  }, []);
  return (
    <div>
      <Toolbar onReload={reload} />
      <StateBox loading={loading} error={error} empty={!!data && data.rows.length === 0} />
      <div className="space-y-2">
        {data?.rows.map((r: any) => (
          <div key={r.id} className="bg-card rounded-xl px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <b>{ACTION_LABEL[r.action] ?? r.action}</b>
              <span className="text-xs text-muted-foreground">{fmt(r.created_at)}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              用戶：{nameOf(data.profiles, r.user_id)}・admin {String(r.admin_id).slice(0, 8)}
            </div>
            {r.note && <div className="text-xs mt-1">備註：{r.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= 設定（參考價、每日上限、開關） ================= */

type SettingDef = { key: string; label: string; hint?: string; kind: "money" | "int" | "multiple" | "ratio" | "bool"; required?: boolean; unit?: string };

const SETTING_GROUPS: { title: string; note?: string; items: SettingDef[] }[] = [
  {
    title: "唔支持炒飛：泊車優惠單據參考價",
    note: "參考價 = 商場停車場時租 × 下面嘅比例 × 換到幾多個鐘（星期六日用假日時租）。超過參考價會提醒放嘅人同要嘅人；超過倍數就放唔到。商場冇時租資料就冇參考價。餐廳排隊飛、優惠券同夾單唔管。",
    items: [
      { key: "parking_ref_rate_factor", label: "時租比例", hint: "0.5 = 時租一半；1 = 時租全數", unit: "倍時租", kind: "ratio", required: true },
      { key: "price_block_multiple", label: "超過參考價幾多倍唔俾放", unit: "倍", kind: "multiple", required: true },
    ],
  },
  {
    title: "每日上限",
    note: "香港時間每日 0 點重新計，取消咗都計。唔限同一時間手上有幾多張。",
    items: [
      { key: "limit_dining_per_day", label: "每人每日最多放餐廳排隊飛", unit: "張", kind: "int", required: true },
      { key: "limit_dining_branch_per_day", label: "同一間分店（同一個商場同一個舖名）每人每日", unit: "張", kind: "int", required: true },
      { key: "limit_parking_per_day", label: "每人每日最多放泊車優惠單據", unit: "張", kind: "int", required: true },
    ],
  },
  {
    title: "開關",
    items: [
      { key: "pin_enabled", label: "置頂", hint: "暫時收埋；開咗用家先見到置頂掣", kind: "bool" },
      { key: "sms_login", label: "SMS 登入", hint: "開之前要先喺 Supabase 開通 SMS 供應商，唔係撳咗都收唔到驗證碼", kind: "bool" },
    ],
  },
];

export function AahSettingsTab() {
  const { data, error, loading, reload } = useLoad(async () => {
    const { data, error } = await sb().from("aah_settings").select("key,value");
    if (error) throw error;
    return new Map<string, unknown>((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
  }, []);
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    const d: Record<string, string | boolean> = {};
    for (const g of SETTING_GROUPS)
      for (const it of g.items) {
        const v = data.get(it.key);
        d[it.key] = it.kind === "bool" ? v === true : v == null ? "" : String(v);
      }
    setDraft(d);
  }, [data]);

  async function save() {
    const rows: { key: string; value: unknown }[] = [];
    for (const g of SETTING_GROUPS)
      for (const it of g.items) {
        const v = draft[it.key];
        if (it.kind === "bool") {
          rows.push({ key: it.key, value: v === true });
          continue;
        }
        const t = String(v ?? "").trim();
        if (!t) {
          if (it.required) return toast.error(`「${it.label}」一定要填`);
          rows.push({ key: it.key, value: null });
          continue;
        }
        const n = Number(t);
        if (!Number.isFinite(n) || n <= 0) return toast.error(`「${it.label}」要係大過 0 嘅數字`);
        if (it.kind === "int" && !Number.isInteger(n)) return toast.error(`「${it.label}」要係整數`);
        if (it.kind === "multiple" && n < 1) return toast.error("倍數最少 1");
        if (it.kind === "ratio" && n > 5) return toast.error("時租比例最多 5");
        rows.push({ key: it.key, value: n });
      }
    setBusy(true);
    try {
      const { error } = await sb().from("aah_settings").upsert(rows, { onConflict: "key" });
      if (error) throw error;
      toast.success("已儲存", { description: "伺服器即刻用新數字；用家下次開 app 就見到新提示" });
      void reload();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Toolbar onReload={reload} />
      <StateBox loading={loading} error={error} empty={false} />
      {data && (
        <div className="space-y-4">
          {SETTING_GROUPS.map((g) => (
            <section key={g.title} className="bg-card rounded-2xl p-4 space-y-3">
              <div>
                <div className="font-bold">{g.title}</div>
                {g.note && <p className="text-xs text-muted-foreground mt-0.5">{g.note}</p>}
              </div>
              {g.items.map((it) =>
                it.kind === "bool" ? (
                  <label key={it.key} className="flex items-start justify-between gap-3">
                    <span className="text-sm">
                      {it.label}
                      {it.hint && <span className="block text-[11px] text-muted-foreground">{it.hint}</span>}
                    </span>
                    <input
                      type="checkbox"
                      checked={draft[it.key] === true}
                      onChange={(e) => setDraft({ ...draft, [it.key]: e.target.checked })}
                      className="w-5 h-5 mt-0.5"
                      aria-label={it.label}
                    />
                  </label>
                ) : (
                  <label key={it.key} className="block space-y-1">
                    <span className="text-sm">
                      {it.label}
                      {it.hint && <span className="block text-[11px] text-muted-foreground">{it.hint}</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      {it.unit?.endsWith("$") && <span className="text-xs text-muted-foreground shrink-0">{it.unit}</span>}
                      <input
                        inputMode="decimal"
                        value={String(draft[it.key] ?? "")}
                        onChange={(e) => setDraft({ ...draft, [it.key]: e.target.value.replace(/[^\d.]/g, "").slice(0, 6) })}
                        placeholder={it.required ? "" : "留空 = 唔限"}
                        aria-label={it.label}
                        className="h-10 w-32 px-3 rounded-lg border border-border bg-background outline-none"
                      />
                      {it.unit && !it.unit.endsWith("$") && <span className="text-xs text-muted-foreground">{it.unit}</span>}
                    </span>
                  </label>
                ),
              )}
            </section>
          ))}
          <button onClick={save} disabled={busy} className="w-full h-11 rounded-xl bg-foreground text-background font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}儲存
          </button>
        </div>
      )}
    </div>
  );
}

/* ================= 可疑帳戶（同一部機開多個帳戶、被舉報、冇出現） ================= */

type Suspicious = {
  id: string;
  nickname: string | null;
  created_at: string;
  no_shows: number;
  banned_until: string | null;
  accounts_on_device: number;
  device_mates: string[];
  reports: number;
  open_reports: number;
  scalping_reports: number;
};

export function AahSuspiciousTab() {
  const { data, error, loading, reload } = useLoad(async () => {
    const [{ data: rows, error: e1 }, { data: stats, error: e2 }] = await Promise.all([
      sb().rpc("aah_admin_suspicious"),
      sb().rpc("aah_admin_stats"),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    return { rows: (rows ?? []) as Suspicious[], stats: stats as Record<string, number> };
  }, []);
  return (
    <div>
      <Toolbar onReload={reload} />
      {data?.stats && (
        <div className="rounded-xl bg-card p-3 mb-3 text-sm">
          今個月封咗 <b>{data.stats.bans_this_month}</b> 個帳戶（冇出現 {data.stats.bans_noshow}、舉報 {data.stats.bans_report}）・
          收到舉報 {data.stats.reports_this_month} 宗（炒飛 {data.stats.scalping_reports_this_month} 宗）
        </div>
      )}
      <p className="text-xs text-muted-foreground mb-3">
        暫時冇做電話驗證。呢度列出可能濫用嘅帳戶，方便之後決定要唔要加驗證。「同一部機」用 app 自己整嘅隨機裝置號碼計，唔係電話號碼。
      </p>
      <StateBox loading={loading} error={error} empty={!!data && data.rows.length === 0} />
      <div className="space-y-2">
        {data?.rows.map((r) => {
          const banned = r.banned_until && new Date(r.banned_until).getTime() > Date.now();
          return (
            <div key={r.id} className="rounded-xl bg-card p-3 text-sm space-y-1" data-testid="suspicious-row">
              <div className="flex items-center justify-between gap-2">
                <b>{r.nickname ?? r.id.slice(0, 6)}</b>
                <span className="text-xs text-muted-foreground">帳戶 {daysSince(r.created_at)} 日</span>
              </div>
              <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                {r.accounts_on_device > 1 && (
                  <span className="text-amber-700 font-semibold">
                    同一部機 {r.accounts_on_device} 個帳戶{r.device_mates.length ? `（${r.device_mates.join("、")}）` : ""}
                  </span>
                )}
                {r.reports > 0 && (
                  <span>
                    被舉報 {r.reports} 次{r.scalping_reports ? `（炒飛 ${r.scalping_reports}）` : ""}{r.open_reports ? `・未處理 ${r.open_reports}` : ""}
                  </span>
                )}
                {r.no_shows > 0 && <span>冇出現 {r.no_shows} 次</span>}
                {banned && <span className="text-red-600 font-semibold">停用到 {fmt(r.banned_until)}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================= 用家意見（「我的」→「話我哋知」） ================= */

type Feedback = { id: string; user_id: string | null; page: string | null; text: string; status: "new" | "read"; created_at: string };

export function AahFeedbackTab() {
  const [filter, setFilter] = useState<"new" | "all">("new");
  const { data, error, loading, reload } = useLoad(async () => {
    let q = sb().from("aah_feedback").select("*").order("created_at", { ascending: false }).limit(200);
    if (filter === "new") q = q.eq("status", "new");
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as Feedback[];
    return { rows, profiles: await fetchProfiles(rows.map((r) => r.user_id)) };
  }, [filter]);
  async function markRead(id: string) {
    const { error } = await sb().from("aah_feedback").update({ status: "read" }).eq("id", id);
    if (error) toast.error(friendlyError(error));
    else void reload();
  }
  return (
    <div>
      <Toolbar onReload={reload}>
        <Seg value={filter} onChange={setFilter} options={[["new", "未睇"], ["all", "全部"]]} />
      </Toolbar>
      <StateBox loading={loading} error={error} empty={!!data && data.rows.length === 0} />
      <div className="space-y-2">
        {data?.rows.map((r) => (
          <div key={r.id} className="rounded-xl bg-card p-3 text-sm space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {r.user_id ? nameOf(data.profiles, r.user_id) : "已刪除帳戶"}
                {r.page ? `・${r.page}` : ""}
              </span>
              <span>{fmt(r.created_at)}</span>
            </div>
            <div className="whitespace-pre-wrap break-words">{r.text}</div>
            {r.status === "new" && (
              <button onClick={() => markRead(r.id)} className="text-xs underline text-muted-foreground">
                標記睇咗
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
