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

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
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
          {!ready ? (
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
                    placeholder="請再次輸入密碼"
                    className="flex-1 bg-transparent text-sm outline-none"
                  />
                </div>
              </label>
              <button
                onClick={handleReset}
                disabled={loading}
                className="w-full bg-[#1a1a1a] text-white font-semibold rounded-xl py-3 text-sm disabled:opacity-60"
              >
                {loading ? "處理中..." : "確認重設"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
