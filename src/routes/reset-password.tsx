import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Lock } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "重設密碼 · 啱啱好" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  // 連結問題：用過咗、過咗期、或者打開咗唔完整嘅連結
  const [linkError, setLinkError] = useState<"expired" | "invalid" | null>(null);

  useEffect(() => {
    // Supabase 驗證失敗時會將錯誤放喺網址（#error_code=otp_expired 之類）
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const query = new URLSearchParams(window.location.search);
    const code = hash.get("error_code") ?? query.get("error_code") ?? hash.get("error") ?? query.get("error");
    if (code) {
      setLinkError(code === "otp_expired" ? "expired" : "invalid");
      return;
    }
    let ok = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        ok = true;
        setReady(true);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        ok = true;
        setReady(true);
      }
    });
    // 等咗 8 秒都冇登入狀態：當連結無效處理，唔好一直轉
    const t = setTimeout(() => {
      if (!ok) setLinkError("invalid");
    }, 8000);
    return () => {
      clearTimeout(t);
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleReset() {
    if (password.length < 6) {
      toast.error("密碼最少要 6 個字");
      return;
    }
    if (password !== confirm) {
      toast.error("兩次輸入嘅密碼唔一樣");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error("重設失敗", { description: error.message });
      return;
    }
    // 撳 email 連結已經證明係本人：直接保持登入，返去啱啱好
    toast.success("密碼已經改好");
    navigate({ to: "/me" });
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="bg-[#F5C518] text-[#1a1a1a] px-4 pt-10 pb-16 rounded-b-3xl">
        <h1 className="text-2xl font-bold">重設密碼</h1>
        <p className="text-sm text-[#5c4a00] mt-1">設定新密碼，之後用新密碼登入</p>
      </div>
      <div className="flex-1 px-4 -mt-10">
        <div className="bg-card rounded-2xl p-5 shadow-[var(--shadow-card)] space-y-4">
          {linkError && !ready ? (
            <div className="space-y-3 py-2 text-center">
              <div className="font-bold">{linkError === "expired" ? "呢條連結已經過咗期" : "呢條連結用唔到"}</div>
              <p className="text-sm text-muted-foreground">
                重設密碼連結只可以用一次，而且有時限。可能已經喺另一部機撳過，或者撳咗舊嗰封 email。返去 app 再撳「唔記得密碼」，用最新嗰封 email 嘅連結就得。
              </p>
              <button onClick={() => navigate({ to: "/me" })} className="w-full bg-[#1a1a1a] text-white font-semibold rounded-xl py-3 text-sm">
                返去重新申請
              </button>
            </div>
          ) : !ready ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              驗證緊重設連結…
            </p>
          ) : (
            <>
              <label className="block">
                <div className="text-xs font-semibold text-muted-foreground mb-1.5">新密碼</div>
                <div className="flex items-center gap-2 border border-input rounded-xl px-3 py-2.5 bg-background">
                  <Lock className="w-4 h-4 text-muted-foreground" />
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="最少 6 個字"
                    className="flex-1 bg-transparent text-sm outline-none"
                  />
                </div>
              </label>
              <label className="block">
                <div className="text-xs font-semibold text-muted-foreground mb-1.5">再次輸入</div>
                <div className="flex items-center gap-2 border border-input rounded-xl px-3 py-2.5 bg-background">
                  <Lock className="w-4 h-4 text-muted-foreground" />
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="再打多次新密碼"
                    className="flex-1 bg-transparent text-sm outline-none"
                  />
                </div>
              </label>
              <button
                onClick={handleReset}
                disabled={loading}
                className="w-full bg-[#1a1a1a] text-white font-semibold rounded-xl py-3 text-sm disabled:opacity-60"
              >
                {loading ? "改緊…" : "確認重設"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
