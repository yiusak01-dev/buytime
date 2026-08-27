import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { User as UserIcon, ArrowLeft, Mail, Lock } from "lucide-react";

import { mockStore } from "@/lib/mock-store";
import { syncUserToOwn } from "@/lib/own-db";
import { recordPendingReferral } from "@/lib/referrals";

function mapAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("already registered") || m.includes("already been registered") || m.includes("user already"))
    return "此電郵已被註冊";
  if (m.includes("invalid login credentials") || m.includes("invalid password") || m.includes("wrong password"))
    return "電郵或密碼錯誤";
  if (m.includes("email not confirmed"))
    return "請先到電郵確認帳戶";
  if (m.includes("invalid email") || (m.includes("email address") && m.includes("invalid")))
    return "請輸入有效電郵";
  if (m.includes("password") && (m.includes("short") || m.includes("8") || m.includes("weak") || m.includes("characters")))
    return "密碼至少需要 8 個字元";
  return msg;
}

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "登入 · 買時間" }] }),
  component: AuthPage,
});

type View = "signin" | "signup" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>("signin");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailName, setEmailName] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [refCode, setRefCode] = useState("");

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        navigate({ to: "/" });
      }
    })();
  }, [navigate]);

  async function handleEmailAuth() {
    if (!email.includes("@") || password.length < 8) {
      toast.error("請輸入有效電郵及至少 8 個字元密碼");
      return;
    }
    if (view === "signup" && !emailName.trim()) {
      toast.error("請輸入你的顯示名稱，讓對方認識你");
      return;
    }
    setLoading(true);
    if (view === "signup") {
      if (refCode) {
        try { window.localStorage.setItem("referral_code", refCode); } catch {}
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: { name: emailName.trim() || email.split("@")[0] },
        },
      });
      if (error) {
        setLoading(false);
        toast.error(mapAuthError(error.message));
        return;
      }
      if (data.session) {
        await supabase.auth.signOut();
      }
      setLoading(false);
      setEmailSent(true);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        toast.error(mapAuthError(error.message));
        return;
      }
      const { data: meData } = await supabase.auth.getUser();
      if (meData.user) {
        const { data: userData } = await (supabase as any)
          .from("users")
          .select("is_banned, ban_reason")
          .eq("id", meData.user.id)
          .maybeSingle();

        if (userData?.is_banned) {
          await supabase.auth.signOut();
          toast.error("帳號已被封禁", { description: userData.ban_reason ?? "請聯絡客服" });
          return;
        }
      }
      toast.success("登入成功");
      if (meData.user) {
        const dn = (meData.user.user_metadata?.name as string | undefined) || email.split("@")[0];
        mockStore.setUser({ name: dn, initial: dn.charAt(0).toUpperCase() });
        syncUserToOwn(meData.user, { name: dn }).catch(() => {});
        recordPendingReferral(meData.user).catch(() => {});
      }
      navigate({ to: "/" });
    }
  }

  async function handleForgotPassword() {
    if (!email.includes("@")) {
      toast.error("請輸入有效電郵");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast.error(mapAuthError(error.message));
      return;
    }
    setResetSent(true);
    toast.success("重設連結已發送，請查閱電郵");
  }

  const showBack = view !== "signin" || emailSent || resetSent;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="gradient-primary text-white px-4 pt-10 pb-16 rounded-b-3xl">
        {showBack && (
          <button
            onClick={() => { setEmailSent(false); setResetSent(false); setView("signin"); }}
            className="inline-flex items-center gap-1 text-xs text-white/80 mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> 返回登入
          </button>
        )}
        <h1 className="text-2xl font-bold">買時間</h1>
        <p className="text-sm text-white/80 mt-1">
          {emailSent && "確認電郵已發送"}
          {resetSent && "重設連結已發送"}
          {!emailSent && !resetSent && view === "signin" && "電郵登入"}
          {!emailSent && !resetSent && view === "signup" && "建立新帳戶"}
          {!emailSent && !resetSent && view === "forgot" && "忘記密碼"}
        </p>
      </div>

      <div className="flex-1 px-4 -mt-10">
        <div className="bg-card rounded-2xl p-5 shadow-[var(--shadow-card)] space-y-4">
          {emailSent ? (
            <div className="text-center space-y-4 py-4">
              <div className="text-4xl">📧</div>
              <div className="font-semibold text-base">確認電郵已發送</div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                請查閱 <span className="font-semibold text-foreground">{email}</span> 的收件箱，
                點擊確認連結後即可登入。
              </p>
              <p className="text-xs text-muted-foreground">未收到？請檢查垃圾郵件資料夾</p>
              <button
                onClick={() => { setEmailSent(false); setView("signin"); }}
                className="w-full gradient-primary text-white font-semibold rounded-xl py-3 text-sm"
              >
                返回登入
              </button>
            </div>
          ) : resetSent ? (
            <div className="text-center space-y-4 py-4">
              <div className="text-4xl">🔑</div>
              <div className="font-semibold text-base">重設連結已發送</div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                請查閱 <span className="font-semibold text-foreground">{email}</span>，
                點擊連結後設定新密碼。
              </p>
              <button
                onClick={() => { setResetSent(false); setView("signin"); }}
                className="w-full gradient-primary text-white font-semibold rounded-xl py-3 text-sm"
              >
                返回登入
              </button>
            </div>
          ) : view === "forgot" ? (
            <>
              <label className="block">
                <div className="text-xs font-semibold text-muted-foreground mb-1.5">電郵</div>
                <div className="flex items-center gap-2 border border-input rounded-xl px-3 py-2.5 bg-background">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="test@example.com"
                    className="flex-1 bg-transparent text-sm outline-none"
                  />
                </div>
              </label>
              <button
                onClick={handleForgotPassword}
                disabled={loading}
                className="w-full gradient-primary text-white font-semibold rounded-xl py-3 text-sm disabled:opacity-60"
              >
                {loading ? "發送中..." : "發送重設連結"}
              </button>
            </>
          ) : (
            <>
              {view === "signup" && (
                <label className="block">
                  <div className="text-xs font-semibold text-muted-foreground mb-1.5">顯示名稱 <span className="text-destructive">*</span></div>
                  <div className="flex items-center gap-2 border border-input rounded-xl px-3 py-2.5 bg-background">
                    <UserIcon className="w-4 h-4 text-muted-foreground" />
                    <input
                      value={emailName}
                      onChange={(e) => setEmailName(e.target.value)}
                      placeholder="你的名字（其他用戶可見）"
                      className="flex-1 bg-transparent text-sm outline-none"
                    />
                  </div>
                </label>
              )}
              <label className="block">
                <div className="text-xs font-semibold text-muted-foreground mb-1.5">電郵</div>
                <div className="flex items-center gap-2 border border-input rounded-xl px-3 py-2.5 bg-background">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="test@example.com"
                    className="flex-1 bg-transparent text-sm outline-none"
                  />
                </div>
              </label>
              <label className="block">
                <div className="text-xs font-semibold text-muted-foreground mb-1.5">密碼</div>
                <div className="flex items-center gap-2 border border-input rounded-xl px-3 py-2.5 bg-background">
                  <Lock className="w-4 h-4 text-muted-foreground" />
                  <input
                    type="password"
                    autoComplete={view === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="至少 8 個字元"
                    className="flex-1 bg-transparent text-sm outline-none"
                  />
                </div>
                {view === "signin" && (
                  <div className="text-right mt-1.5">
                    <button
                      type="button"
                      onClick={() => setView("forgot")}
                      className="text-xs font-semibold text-primary"
                    >
                      忘記密碼？
                    </button>
                  </div>
                )}
              </label>
              {view === "signup" && (
                <label className="block">
                  <div className="text-xs font-semibold text-muted-foreground mb-1.5">邀請碼（選填）</div>
                  <div className="flex items-center gap-2 border border-input rounded-xl px-3 py-2.5 bg-background">
                    <input
                      value={refCode}
                      onChange={(e) => setRefCode(e.target.value.toUpperCase().trim())}
                      placeholder="朋友的邀請碼"
                      maxLength={8}
                      className="flex-1 bg-transparent text-sm outline-none tracking-widest font-mono"
                    />
                  </div>
                </label>
              )}
              <button
                onClick={handleEmailAuth}
                disabled={loading}
                className="w-full gradient-primary text-white font-semibold rounded-xl py-3 text-sm disabled:opacity-60"
              >
                {loading ? "處理中..." : view === "signin" ? "登入" : "註冊"}
              </button>
              <button
                onClick={() => setView(view === "signin" ? "signup" : "signin")}
                className="w-full text-primary text-xs font-semibold"
              >
                {view === "signin" ? "未有帳戶？註冊" : "已有帳戶？登入"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
