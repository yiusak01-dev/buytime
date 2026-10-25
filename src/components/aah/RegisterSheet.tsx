import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { aah, aahErrorText, useAahMode, useAahState } from "@/lib/aah/store";
import { BottomSheet, DemoBadge } from "./ui";
import { cn } from "@/lib/utils";

type Step = "signup" | "login" | "checkEmail" | "profile";

/**
 * 用 email 註冊／登入。
 * Supabase 開咗 email 確認：註冊後要先去 email 撳連結，返嚟登入時會自動用註冊時填嘅暱稱建立 profile。
 * 電話號碼暫時可以唔填（之後接短訊驗證先再要求）。
 */
export function RegisterSheet({ open, onClose, onDone, reason }: { open: boolean; onClose: () => void; onDone: () => void; reason?: string }) {
  const mode = useAahMode();
  const { user } = useAahState();
  const [step, setStep] = useState<Step>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // 已經登入但未建立 profile（例如用舊帳戶登入）：直接問暱稱
  useEffect(() => {
    if (open && user.signedIn && !user.registered) setStep("profile");
  }, [open, user.signedIn, user.registered]);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const phoneOk = phone === "" || /^[4-9]\d{7}$/.test(phone);
  const fullPhone = phone ? `+852${phone}` : undefined;

  function close() {
    setErr("");
    if (step === "checkEmail") setStep("login");
    onClose();
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setErr("");
    try {
      await fn();
    } catch (e) {
      setErr(aahErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full h-12 border border-border rounded-2xl px-3 bg-background outline-none";
  const primary = "w-full h-12 rounded-2xl font-bold disabled:opacity-40 inline-flex items-center justify-center gap-2";

  const title = step === "login" ? "登入" : step === "checkEmail" ? "去 email 確認" : step === "profile" ? "改個暱稱" : "註冊";

  return (
    <BottomSheet open={open} onClose={close} title={title}>
      <div className="space-y-4 pb-2">
        {reason && step !== "checkEmail" && <p className="text-sm text-muted-foreground">{reason}</p>}

        {(step === "signup" || step === "login") && (
          <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-accent">
            {(["signup", "login"] as const).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setStep(s);
                  setErr("");
                }}
                className={cn("h-10 rounded-xl text-sm font-bold", step === s ? "bg-card shadow-sm" : "text-muted-foreground")}
              >
                {s === "signup" ? "新用戶註冊" : "已有帳戶登入"}
              </button>
            ))}
          </div>
        )}

        {step === "signup" && (
          <>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={input} />
            <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密碼（最少 6 個字）" className={input} />
            <input value={nickname} onChange={(e) => setNickname(e.target.value.slice(0, 12))} placeholder="暱稱，例如 阿明" className={input} />
            <div className="flex items-center gap-2 border border-border rounded-2xl px-3 h-12 bg-background">
              <span className="text-sm font-semibold text-muted-foreground">+852</span>
              <input
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="手機號碼（可以唔填）"
                className="flex-1 bg-transparent outline-none"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">對方只會見到你嘅暱稱，唔會見到 email 同電話。</p>
            {mode === "local" && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <DemoBadge /> 示範版唔會真係建立帳戶。
              </p>
            )}
            {err && <p className="text-xs text-destructive">{err}</p>}
            <button
              disabled={!emailOk || password.length < 6 || !nickname.trim() || !phoneOk || busy}
              onClick={() =>
                run(async () => {
                  const r = await aah.signUpEmail(email.trim(), password, nickname.trim(), fullPhone);
                  if (r === "confirm") setStep("checkEmail");
                  else onDone();
                })
              }
              className={cn(primary, "bg-[#F5C518] text-[#1a1a1a]")}
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}註冊
            </button>
            <p className="text-[11px] text-muted-foreground text-center">
              撳「註冊」即表示你同意
              <Link to="/terms" className="underline mx-0.5">服務條款</Link>
              及
              <Link to="/privacy" className="underline mx-0.5">私隱政策</Link>
            </p>
          </>
        )}

        {step === "login" && (
          <>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={input} />
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密碼" className={input} />
            {err && <p className="text-xs text-destructive">{err}</p>}
            <button
              disabled={!emailOk || !password || busy}
              onClick={() =>
                run(async () => {
                  const r = await aah.signInEmail(email.trim(), password);
                  if (r === "need_profile") setStep("profile");
                  else onDone();
                })
              }
              className={cn(primary, "bg-[#1a1a1a] text-white")}
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}登入
            </button>
            {mode === "remote" && (
              <button
                disabled={!emailOk || busy}
                onClick={() =>
                  run(async () => {
                    await aah.resetPassword(email.trim());
                    toast.success("已經寄出重設密碼嘅 email");
                  })
                }
                className="w-full text-xs text-muted-foreground underline disabled:opacity-40"
              >
                唔記得密碼？（先填 email）
              </button>
            )}
          </>
        )}

        {step === "checkEmail" && (
          <div className="space-y-4 text-center">
            <MailCheck className="w-12 h-12 mx-auto text-[#2E9E6A]" />
            <div className="font-bold">確認連結已經寄去 {email}</div>
            <p className="text-sm text-muted-foreground">打開 email，撳「確認 email」掣，再撳「確認我嘅 email」，就會自動登入，用「{nickname}」做暱稱。</p>
            <p className="text-[11px] text-muted-foreground">搵唔到就睇吓垃圾郵件。喺另一部機確認咗嘅話，返嚟呢度登入就得。</p>
            <button
              onClick={() => {
                setStep("login");
                setErr("");
              }}
              className={cn(primary, "bg-[#1a1a1a] text-white")}
            >
              已經確認，去登入
            </button>
          </div>
        )}

        {step === "profile" && (
          <>
            <p className="text-sm text-muted-foreground">{user.email ? `${user.email} 已經登入。` : ""}改個暱稱就可以開始用。</p>
            <input autoFocus value={nickname} onChange={(e) => setNickname(e.target.value.slice(0, 12))} placeholder="暱稱，例如 阿明" className={input} />
            {err && <p className="text-xs text-destructive">{err}</p>}
            <button
              disabled={!nickname.trim() || busy}
              onClick={() =>
                run(async () => {
                  await aah.completeRegistration(fullPhone ?? null, nickname.trim());
                  onDone();
                })
              }
              className={cn(primary, "bg-[#F5C518] text-[#1a1a1a]")}
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}完成，繼續
            </button>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
