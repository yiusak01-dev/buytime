import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { useMockStore, useTier } from "@/lib/mock-store";
import { TIER_META } from "@/lib/districts";
import { Star, Bell, HelpCircle, FileText, ChevronRight, LogOut, Mail, Pencil, X, TrendingUp, Clock, Copy, Share2, Languages, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n/config";
import { supabase } from "@/integrations/supabase/client";
import { ownSupabase } from "@/integrations/supabase/own-client";
import { fetchOwnUserStats, fetchEarningsAndSavings } from "@/lib/own-db";
import { fetchUserRatingStats, fetchRatingsForUser, isAdmin, type RatingStats, type Rating } from "@/lib/escrow-db";
import { ensureReferralCode, fetchDiscountTxnsRemaining } from "@/lib/referrals";
import { isPushSubscribed, subscribeToPush, unsubscribeFromPush } from "@/lib/push";
import { SellerDashboardSection, WaitlistAndAlertsSection } from "@/components/ProfileExtras";
import { PriceAlertSheet } from "@/components/PriceAlertSheet";
import { useEffect, useState } from "react";
import { requireSignedIn } from "@/lib/auth-guard";

export const Route = createFileRoute("/profile")({
  beforeLoad: requireSignedIn,
  head: () => ({ meta: [{ title: "我的 · 買時間" }] }),
  component: Profile,
});

function Profile() {
  const { user } = useMockStore();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const tier = useTier();
  const meta = TIER_META[tier];
  const [ownProfile, setOwnProfile] = useState<any>(null);
  const [ratingStats, setRatingStats] = useState<RatingStats | null>(null);
  const [recentRatings, setRecentRatings] = useState<Rating[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [emailPrefix, setEmailPrefix] = useState<string | null>(null);
  const [money, setMoney] = useState<{ earned: number; saved: number }>({ earned: 0, saved: 0 });
  const [sellerListings, setSellerListings] = useState<any[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralCount, setReferralCount] = useState(0);
  const [discountTxns, setDiscountTxns] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [lang, setLang] = useState<string>(i18n.language);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [alertSheetOpen, setAlertSheetOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { setListingsLoading(false); return; }
      setSignedIn(true);
      setUserId(data.user.id);
      void isPushSubscribed(data.user.id).then(setPushEnabled);
      setEmailPrefix(data.user.email?.split("@")[0] ?? null);
      void isAdmin(data.user.id).then(setIsAdminUser).catch(() => {});

      const row = await fetchOwnUserStats(data.user.id);
      if (row) setOwnProfile(row);
      const stats = await fetchUserRatingStats(data.user.id);
      setRatingStats(stats);
      setMoney(await fetchEarningsAndSavings(data.user.id));
      const recent = await fetchRatingsForUser(data.user.id);
      setRecentRatings(recent.slice(0, 5));
      const { data: listingsData } = await ownSupabase
        .from("listings")
        .select("id,mall_name,merchant_name,asking_price,parking_hours,status,created_at")
        .eq("seller_id", data.user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      setSellerListings(listingsData ?? []);
      setListingsLoading(false);
      setReferralCode(await ensureReferralCode(data.user.id));
      const { count } = await (supabase as any)
        .from("referrals")
        .select("*", { count: "exact", head: true })
        .eq("referrer_id", data.user.id);
      setReferralCount(count ?? 0);
      setDiscountTxns(await fetchDiscountTxnsRemaining(data.user.id));
    })();
  }, []);

  function formatTime(ts: string | null | undefined, t: (k: any, o?: any) => string) {
    if (!ts) return "";
    const d = new Date(ts);
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return t("time.justNow");
    if (mins < 60) return t("time.minsAgo", { mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t("time.hoursAgo", { hours: hrs });
    return t("time.daysAgo", { days: Math.floor(hrs / 24) });
  }

  const statusLabel: Record<string, string> = { active: t("profile.listingActive"), sold: t("profile.listingSold"), expired: t("profile.listingExpired") };
  const statusColor: Record<string, string> = { active: "text-success", sold: "text-primary", expired: "text-muted-foreground" };

  const rawName = ownProfile?.display_name ?? ownProfile?.name ?? user.name;
  const displayName = !rawName || rawName === "用戶" ? (emailPrefix ?? rawName) : rawName;
  const realRating = ownProfile?.rating ?? 0;

  return (
    <AppLayout>
      <div className="gradient-primary text-white px-4 pt-8 pb-20 rounded-b-3xl">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur grid place-items-center text-2xl font-bold">
            {user.initial}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div className="text-lg font-bold">{displayName}</div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/20">
                {meta.emoji} {t(`tier.${tier}`)}
              </span>
            </div>
            <div className="text-xs text-white/80 flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="inline-flex items-center gap-0.5"><Star className="w-3 h-3 fill-warning text-warning" />{realRating.toFixed(1)}</span>
              <span>·</span>
              <span>{t("profile.completedDeals", { count: ratingStats?.total ?? 0 })}</span>
              {ratingStats && !ratingStats.isNewUser && (
                <>
                  <span>·</span>
                  <span>{t("profile.goodRate", { pct: Math.round(ratingStats.goodRate * 100) })}</span>
                </>
              )}
              {ratingStats?.isNewUser && (
                <span className="inline-flex items-center bg-white/20 rounded-full px-2 py-0.5 text-[10px] font-semibold">{t("profile.newUser")}</span>
              )}
              <span className="inline-flex items-center gap-0.5 bg-white/15 rounded-full px-2 py-0.5 ml-1">{t("profile.betaUser")}</span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="inline-flex items-center gap-1 bg-white/15 rounded-full px-2.5 py-1 text-[11px] font-semibold">
                💰 {t("profile.earned", { amount: money.earned })}
              </span>
              <span className="inline-flex items-center gap-1 bg-white/15 rounded-full px-2.5 py-1 text-[11px] font-semibold">
                🎉 {t("profile.saved", { amount: money.saved })}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-14 space-y-4">
        {recentRatings.length > 0 && (
          <div className="bg-card rounded-2xl shadow-[var(--shadow-card)] p-4">
            <div className="text-sm font-bold mb-2">{t("profile.recentRatings")}</div>
            <div className="space-y-2">
              {recentRatings.map((r) => (
                <div key={r.id} className="flex items-start gap-2 text-xs border-b border-border/50 pb-2 last:border-b-0 last:pb-0">
                  <span className="shrink-0">{r.rating === 5 ? "👍" : "👎"}</span>
                  <div className="flex-1">
                    <div className={r.rating === 5 ? "text-success font-semibold" : "text-destructive font-semibold"}>
                      {r.rating === 5 ? t("profile.goodRating") : `${t("profile.badRating")} · ${r.bad_reason ?? ""}`}
                    </div>
                    {r.comment && <div className="text-muted-foreground mt-0.5">「{r.comment}」</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-card rounded-2xl shadow-[var(--shadow-card)] p-4 space-y-3">
          <div className="text-sm font-bold">{t("profile.sellerMgmt")}</div>
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={<TrendingUp className="w-4 h-4" />} label={t("profile.totalIncome")} value="HK$0" tone="text-success" />
            <StatCard icon={<Clock className="w-4 h-4" />} label={t("profile.pendingPayout")} value="HK$0" tone="text-warning" />
          </div>
          {listingsLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-16 bg-accent rounded-xl animate-pulse" />)}
            </div>
          ) : sellerListings.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground bg-accent rounded-xl">
              {t("profile.noListings")}
            </div>
          ) : (
            <div>
              {sellerListings.slice(0, 5).map((l) => (
                <div key={l.id} className="flex items-center justify-between py-2 border-b border-border/40 last:border-b-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-[10px] font-semibold shrink-0 ${statusColor[l.status] ?? "text-muted-foreground"}`}>
                      {statusLabel[l.status] ?? l.status}
                    </span>
                    <span className="text-sm font-medium truncate">{l.mall_name ?? "商場"}</span>
                    {l.parking_hours && <span className="text-xs text-muted-foreground shrink-0">{l.parking_hours}h</span>}
                  </div>
                  <span className="text-sm font-bold text-primary shrink-0 ml-2">HK${Number(l.asking_price ?? 0).toFixed(0)}</span>
                </div>
              ))}
              {sellerListings.length > 5 && (
                <button
                  onClick={() => navigate({ to: "/transactions" })}
                  className="w-full text-xs text-primary font-semibold py-1 text-center"
                >
                  {t("profile.viewAllListings", { count: sellerListings.length })}
                </button>
              )}
            </div>
          )}
        </div>

        {userId && <SellerDashboardSection userId={userId} />}
        {userId && (
          <WaitlistAndAlertsSection userId={userId} onOpenAlertSheet={() => setAlertSheetOpen(true)} />
        )}

        {signedIn && (
          <div className="space-y-3">
            {discountTxns > 0 && (
              <div className="bg-success/10 border border-success/20 rounded-xl p-3 flex items-center gap-3">
                <span className="text-2xl">🎁</span>
                <div>
                  <div className="text-sm font-semibold">{t("profile.creditBalance")}</div>
                  <div className="text-success font-bold text-lg">{discountTxns} 次</div>
                </div>
              </div>
            )}

            <div className="bg-gradient-to-br from-primary/10 to-primary/20 border border-primary/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">👥</span>
                <div className="font-bold text-sm">{t("profile.referralTitle")}</div>
              </div>
              <div className="text-xs text-muted-foreground">
                {t("profile.referralDesc")}
              </div>
              <div className="bg-background/60 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("profile.referralCodeLabel")}</div>
                  <div className="font-mono font-bold text-xl tracking-widest text-primary">
                    {referralCode ?? "..."}
                  </div>
                </div>
                <button
                  disabled={!referralCode}
                  onClick={() => {
                    if (!referralCode) return;
                    navigator.clipboard.writeText(referralCode);
                    toast.success(t("profile.copyCodeSuccess"));
                  }}
                  aria-label="複製邀請碼"
                  className="p-2 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors disabled:opacity-50"
                >
                  <Copy className="w-4 h-4 text-primary" />
                </button>
              </div>
              <div className="text-xs text-muted-foreground text-center">
                {t("profile.referralSuccessCount", { count: referralCount })}
              </div>
              <button
                disabled={!referralCode}
                onClick={() => {
                  if (!referralCode) return;
                  const url = `${window.location.origin}?ref=${referralCode}`;
                  const text = t("profile.shareText", { code: referralCode, url });
                  if (navigator.share) {
                    navigator.share({ text }).catch(() => {});
                  } else {
                    navigator.clipboard.writeText(text);
                    toast.success(t("profile.copiedShare"));
                  }
                }}
                className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Share2 className="w-4 h-4" />
                {t("profile.shareLink")}
              </button>
            </div>
          </div>
        )}

        <div className="bg-card rounded-2xl divide-y divide-border shadow-[var(--shadow-card)] overflow-hidden">
          <MenuItem icon={<Bell className="w-4 h-4" />} label={t("profile.settings")} onPress={() => setSettingsOpen(true)} />
          {isAdminUser && (
            <MenuItem
              icon={<ShieldAlert className="w-4 h-4" />}
              label="Admin Panel"
              tone="text-destructive"
              onPress={() => navigate({ to: "/admin" })}
            />
          )}
          <MenuItem
            icon={<FileText className="w-4 h-4" />}
            label="交易 & 放單"
            onPress={() => navigate({ to: "/transactions" })}
          />
          <MenuItem icon={<HelpCircle className="w-4 h-4" />} label={t("profile.helpCenter")} onPress={() => navigate({ to: "/help" })} />
          <MenuItem
            icon={<Mail className="w-4 h-4" />}
            label={t("profile.feedback")}
            onPress={() => {
              window.open(
                "mailto:hello@buytime.hk?subject=%E8%B2%B7%E6%99%82%E9%96%93%20App%20%E6%84%8F%E8%A6%8B&body=%E4%BD%A0%E5%A5%BD%E8%B2%B7%E6%99%82%E9%96%93%E5%9C%98%E9%9A%8A%EF%BC%8C%E6%88%91%E6%83%B3%E5%88%86%E4%BA%AB%E4%BB%A5%E4%B8%8B%E6%84%8F%E8%A6%8B%EF%BC%9A%0A%0A",
                "_self"
              );
            }}
          />
        </div>

        <div className="bg-card rounded-2xl divide-y divide-border shadow-[var(--shadow-card)] overflow-hidden">
          <MenuItem icon={<FileText className="w-4 h-4" />} label={t("profile.terms")} onPress={() => navigate({ to: "/terms" })} />
          <MenuItem icon={<FileText className="w-4 h-4" />} label={t("profile.privacy")} onPress={() => navigate({ to: "/privacy" })} />
        </div>

        {signedIn && (
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              toast(t("profile.loggedOut"));
              navigate({ to: "/auth", replace: true });
            }}
            className="w-full bg-card rounded-2xl py-3.5 text-sm text-destructive font-semibold flex items-center justify-center gap-2 shadow-[var(--shadow-card)]"
          >
            <LogOut className="w-4 h-4" /> {t("profile.logout")}
          </button>
        )}

        <div className="text-center text-[10px] text-muted-foreground pb-4">
          {t("profile.version")}
        </div>
      </div>

      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setEditOpen(false)}>
          <div className="bg-card w-full max-w-lg rounded-t-3xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-lg font-bold">{t("profile.editTitle")}</div>
              <button onClick={() => setEditOpen(false)} aria-label="關閉"><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("profile.nameLabel")}</label>
              <input
                value={editName}
                onChange={e => { setEditName(e.target.value); setNameError(null); }}
                maxLength={20}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                placeholder={t("profile.namePlaceholder")}
              />
              {nameError && <div className="text-xs text-destructive">{nameError}</div>}
            </div>
            <button
              disabled={saving || !editName.trim()}
              onClick={async () => {
                setSaving(true);
                setNameError(null);
                const { data: authData } = await supabase.auth.getUser();
                if (authData.user) {
                  const { data: existing } = await (supabase as any)
                    .from("users")
                    .select("id")
                    .eq("display_name", editName.trim())
                    .neq("id", authData.user.id)
                    .limit(1);
                  if (existing && existing.length > 0) {
                    const msg = "此名稱已被其他用戶使用，請選擇另一個名稱";
                    setNameError(msg);
                    toast.error(msg);
                    setSaving(false);
                    return;
                  }
                  await (supabase as any).from("users").update({ display_name: editName.trim() }).eq("id", authData.user.id);
                  const row = await fetchOwnUserStats(authData.user.id);
                  if (row) setOwnProfile(row);
                }
                setSaving(false);
                setEditOpen(false);
              }}
              className="w-full h-12 bg-primary text-primary-foreground rounded-xl font-bold text-sm disabled:opacity-50"
            >
              {saving ? t("profile.saving") : t("profile.save")}
            </button>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setSettingsOpen(false)}>
          <div className="bg-card w-full max-w-lg rounded-t-3xl p-6 space-y-2" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-lg font-bold">{t("profile.settings")}</div>
              <button onClick={() => setSettingsOpen(false)} aria-label="關閉"><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>

            <button
              onClick={() => { setEditName(displayName); setEditOpen(true); setSettingsOpen(false); }}
              className="w-full flex items-center justify-between py-3.5"
            >
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground"><Pencil className="w-4 h-4" /></span>
                <span className="text-sm">{t("profile.editProfile")}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>

            {signedIn && (
              <button
                disabled={pushBusy}
                onClick={async () => {
                  if (!userId || pushBusy) return;
                  setPushBusy(true);
                  if (pushEnabled) {
                    await unsubscribeFromPush(userId);
                    setPushEnabled(false);
                    toast.success(t("profile.pushOff"));
                  } else {
                    const ok = await subscribeToPush(userId);
                    setPushEnabled(ok);
                    if (ok) {
                      toast.success(t("profile.pushOn"));
                    } else {
                      const perm = typeof Notification !== "undefined" ? Notification.permission : "unsupported";
                      if (perm === "denied") {
                        toast.error("通知已被封鎖，請在瀏覽器設定中允許此網站的通知，然後重試");
                      } else if (perm === "unsupported" || typeof PushManager === "undefined") {
                        toast.error("此瀏覽器不支援推送通知，請改用 Chrome 瀏覽器開啟 App");
                      } else {
                        toast.error(t("profile.pushFail"));
                      }
                    }
                  }
                  setPushBusy(false);
                }}
                className="w-full flex items-center justify-between py-3.5 disabled:opacity-60"
              >
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground"><Bell className="w-4 h-4" /></span>
                  <span className="text-sm">{t("profile.pushToggle")}</span>
                </div>
                <div className={`w-10 h-5 rounded-full transition-colors relative ${pushEnabled ? "bg-primary" : "bg-muted"}`}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${pushEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
                </div>
              </button>
            )}

            <button
              onClick={() => {
                const next = i18n.language === "zh-HK" ? "en" : "zh-HK";
                i18n.changeLanguage(next);
                localStorage.setItem("lang", next);
                setLang(next);
              }}
              className="w-full flex items-center justify-between py-3.5"
            >
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground"><Languages className="w-4 h-4" /></span>
                <span className="text-sm">語言 / Language</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{lang === "zh-HK" ? "中文" : "EN"}</span>
                <div className={`w-10 h-5 rounded-full transition-colors relative ${lang === "en" ? "bg-primary" : "bg-muted"}`}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${lang === "en" ? "translate-x-5" : "translate-x-0.5"}`} />
                </div>
              </div>
            </button>
          </div>
        </div>
      )}
      <PriceAlertSheet open={alertSheetOpen} onOpenChange={setAlertSheetOpen} />
    </AppLayout>
  );
}

function MenuItem({ icon, label, tone, badge, badgeTone, onPress }: {
  icon: React.ReactNode;
  label: string;
  tone?: string;
  badge?: string;
  badgeTone?: string;
  onPress?: () => void;
}) {
  return (
    <button
      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-accent/40 text-left"
      onClick={onPress}
    >
      <div className={`w-8 h-8 rounded-lg bg-accent grid place-items-center ${tone ?? "text-muted-foreground"}`}>{icon}</div>
      <span className="flex-1 text-sm font-medium">{label}</span>
      {badge && <span className={`text-xs font-semibold ${badgeTone ?? "text-success"}`}>{badge}</span>}
      <ChevronRight className="w-4 h-4 text-muted-foreground" />
    </button>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className="bg-accent rounded-xl p-3">
      <div className={`${tone} mb-1`}>{icon}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`font-bold text-sm ${tone}`}>{value}</div>
    </div>
  );
}
