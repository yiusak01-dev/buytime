import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { RegisterSheet } from "@/components/aah/RegisterSheet";
import { useAahState } from "@/lib/aah/store";

export const Route = createFileRoute("/confirm")({
  head: () => ({ meta: [{ title: "確認 email · 啱啱好" }] }),
  component: ConfirmPage,
});

type EmailType = "email" | "signup" | "invite" | "magiclink" | "email_change";

/**
 * 註冊確認頁。Email 入面嘅掣帶人嚟呢度，要用家撳「確認」先真係驗證：
 * 有啲 email 系統會預先撳連結做安全檢查，直接驗證嘅話一次性連結會俾佢用咗。
 */
function ConfirmPage() {
  const navigate = useNavigate();
  const { user } = useAahState();
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [type, setType] = useState<EmailType>("email");
  const [state, setState] = useState<"checking" | "ready" | "verifying" | "done" | "expired" | "invalid">("checking");
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const errCode = hash.get("error_code") ?? q.get("error_code") ?? hash.get("error") ?? q.get("error");
    if (errCode) {
      setState(errCode === "otp_expired" ? "expired" : "invalid");
      return;
    }
    const th = q.get("token_hash");
    if (th) {
      setTokenHash(th);
      const t = (q.get("type") ?? "email") as EmailType;
      setType(t === "signup" ? "email" : t);
      setState("ready");
      return;
    }
    // 舊式連結：Supabase 已經驗證咗並將登入資料放喺網址，supabase-js 會自動接收
    let ok = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        ok = true;
        setState("done");
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        ok = true;
        setState("done");
      }
    });
    const timer = setTimeout(() => {
      if (!ok) setState("invalid");
    }, 8000);
    return () => {
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  // 確認完：喺另一部機確認嘅話冇暱稱，請佢補返
  useEffect(() => {
    if (state !== "done") return;
    const t = setTimeout(() => {
      if (!user.registered) setProfileOpen(true);
    }, 1500);
    return () => clearTimeout(t);
  }, [state, user.registered]);

  async function verify() {
    if (!tokenHash) return;
    setState("verifying");
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) {
      setState(/expired|invalid|not found/i.test(error.message) ? "expired" : "invalid");
      return;
    }
    // 清走網址入面嘅 token，避免重新整理時再用
    window.history.replaceState(null, "", "/confirm");
    setState("done");
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="bg-[#F5C518] text-[#1a1a1a] px-4 pt-10 pb-16 rounded-b-3xl">
        <h1 className="text-2xl font-bold">確認 email</h1>
        <p className="text-sm text-[#5c4a00] mt-1">啱時間・啱地方・啱啱好</p>
      </div>
      <div className="flex-1 px-4 -mt-10">
        <div className="bg-card rounded-2xl p-5 shadow-[var(--shadow-card)] space-y-4 text-center">
          {state === "checking" && <p className="text-sm text-muted-foreground py-6">檢查緊連結…</p>}

          {(state === "ready" || state === "verifying") && (
            <>
              <MailCheck className="w-12 h-12 mx-auto text-[#2E9E6A]" />
              <p className="text-sm text-muted-foreground">撳下面個掣，確認呢個 email 係你嘅。確認完會自動登入。</p>
              <button onClick={verify} disabled={state === "verifying"} className="w-full bg-[#1a1a1a] text-white font-semibold rounded-xl py-3 text-sm disabled:opacity-60">
                {state === "verifying" ? "確認緊…" : "確認我嘅 email"}
              </button>
            </>
          )}

          {state === "done" && (
            <>
              <MailCheck className="w-12 h-12 mx-auto text-[#2E9E6A]" />
              <div className="font-bold">確認咗，歡迎嚟到啱啱好！</div>
              <p className="text-sm text-muted-foreground">{user.registered ? `已經用「${user.nickname ?? ""}」登入。` : "仲差一步：改個暱稱就可以開始用。"}</p>
              <button
                onClick={() => (user.registered ? navigate({ to: "/" }) : setProfileOpen(true))}
                className="w-full bg-[#1a1a1a] text-white font-semibold rounded-xl py-3 text-sm"
              >
                {user.registered ? "開始用" : "改暱稱"}
              </button>
            </>
          )}

          {(state === "expired" || state === "invalid") && (
            <>
              <div className="font-bold">{state === "expired" ? "呢條連結已經過咗期" : "呢條連結用唔到"}</div>
              <p className="text-sm text-muted-foreground">
                確認連結只可以用一次，而且有時限。可能你已經確認咗，直接登入試吓；唔得嘅話再註冊一次，會收到新嘅確認 email。
              </p>
              <button onClick={() => navigate({ to: "/me" })} className="w-full bg-[#1a1a1a] text-white font-semibold rounded-xl py-3 text-sm">
                去登入
              </button>
            </>
          )}
        </div>
      </div>
      <RegisterSheet open={profileOpen} onClose={() => setProfileOpen(false)} onDone={() => navigate({ to: "/" })} />
    </div>
  );
}
