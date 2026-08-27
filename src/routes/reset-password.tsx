import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Lock } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "重設密碼 · 買時間" }] }),
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
    if (password.length < 8) {
      toast.error("密碼至少需要 8 個字元");
      return;
    }
    if (password !== confirm) {
      toast.error("兩次輸入的密碼不一致");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error("重設失敗", { description: error.message });
      return;
    }
    toast.success("密碼已重設，請重新登入");
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="gradient-primary text-white px-4 pt-10 pb-16 rounded-b-3xl">
        <h1 className="text-2xl font-bold">重設密碼</h1>
        <p className="text-sm text-white/80 mt-1">設定新密碼以繼續使用</p>
      </div>
      <div className="flex-1 px-4 -mt-10">
        <div className="bg-card rounded-2xl p-5 shadow-[var(--shadow-card)] space-y-4">
          {!ready ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              正在驗證重設連結...
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
                    placeholder="至少 8 個字元"
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
                className="w-full gradient-primary text-white font-semibold rounded-xl py-3 text-sm disabled:opacity-60"
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
