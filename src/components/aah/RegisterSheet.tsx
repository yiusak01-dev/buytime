import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Lock, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { aah, aahErrorText, getRules, useAahMode, useAahState } from "@/lib/aah/store";
import { logEvent } from "@/lib/aah/track";
import { useAahMalls, nearestMalls } from "@/lib/aah/malls";
import { useGeo, useNow } from "@/lib/aah/geo";
import { nicknameProblem } from "@/lib/aah/nickname";
import { VERBS } from "@/lib/aah/theme";
import type { User } from "@/lib/aah/types";
import { BottomSheet, DemoBadge } from "./ui";
import { cn } from "@/lib/utils";

type Step = "start" | "otp" | "signup" | "login" | "checkEmail" | "profile" | "prefs";

const STRONG = VERBS.find.strong;
const SOFT = VERBS.find.soft;
const input =
  "w-full h-12 border border-border rounded-2xl px-4 bg-card outline-none text-base focus:border-[#3B2F8F]";
const primary =
  "w-full h-12 rounded-2xl font-black disabled:opacity-40 inline-flex items-center justify-center gap-2 text-white";
const outline =
  "w-full h-12 rounded-2xl font-black border border-border bg-card inline-flex items-center justify-center gap-2";

/**
 * 登記／登入：email（SMS 驗證碼要喺管理頁開咗「SMS 登入」先出，開通 SMS 供應商之前收埋）。
 * 登記完問幾樣（常去商場、揸唔揸車、想慳邊樣、收唔收推廣），可以跳過；推廣通知預設唔剔。
 */
export function RegisterSheet({
  open,
  onClose,
  onDone,
  reason,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  reason?: string;
}) {
  const mode = useAahMode();
  const { user } = useAahState();
  const sms = getRules().smsLogin;
  const first: Step = sms ? "start" : "signup";
  const [step, setStep] = useState<Step>(first);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sentAt, setSentAt] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const nickErr = nickname.trim() ? nicknameProblem(nickname) : null;
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // 已經登入但未建立 profile（例如 email 確認完返嚟）：直接問暱稱
  useEffect(() => {
    if (open && user.signedIn && !user.registered) setStep("profile");
  }, [open, user.signedIn, user.registered]);
  // 再打開：未登入就由頭嚟
  useEffect(() => {
    if (open && !user.signedIn)
      setStep((s) =>
        s === "checkEmail"
          ? "login"
          : s === "prefs" || s === "profile"
            ? first
            : !sms && (s === "start" || s === "otp")
              ? "signup"
              : s,
      );
    if (open && !user.registered) logEvent("register_start", { step: first });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const phoneOk = /^[4-9]\d{7}$/.test(phone);
  const fullPhone = `+852${phone}`;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

  function finish() {
    setErr("");
    logEvent("register_done");
    onDone();
  }
  function close() {
    setErr("");
    // 登記咗先閂：當完成（之前想做嘅嘢照做）
    if (step === "prefs") return finish();
    if (!user.registered) logEvent("register_abandon", { step });
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
  function go(s: Step) {
    setErr("");
    setStep(s);
  }

  const title =
    step === "start"
      ? (reason ?? "登記，免費 30 秒")
      : step === "otp"
        ? "輸入驗證碼"
        : step === "signup"
          ? sms
            ? "用 email 登記"
            : (reason ?? "登記，免費 30 秒")
          : step === "login"
            ? "用 email 登入"
            : step === "checkEmail"
              ? "去 email 確認"
              : step === "profile"
                ? "叫你咩名？"
                : "再問你幾樣，30 秒";

  const sendCode = () =>
    run(async () => {
      await aah.sendPhoneOtp(fullPhone);
      setCode("");
      setSentAt(Date.now());
      setStep("otp");
    });

  return (
    <BottomSheet open={open} onClose={close} title={title}>
      <div className="space-y-4 pb-2">
        {step === "start" && (
          <>
            <div className="flex items-center gap-3">
              <span
                className="w-12 h-12 rounded-full grid place-items-center shrink-0"
                style={{ background: SOFT, color: STRONG }}
              >
                <Lock className="w-5 h-5" />
              </span>
              <p className="text-sm text-muted-foreground leading-relaxed">
                免費，30 秒搞掂。對方只會見到你個暱稱，唔會見到電話同 email。
              </p>
            </div>
            <div className="flex gap-2">
              <span className="h-12 px-3.5 rounded-2xl bg-background font-black grid place-items-center shrink-0">
                +852
              </span>
              <label htmlFor="reg-phone" className="sr-only">
                手機號碼
              </label>
              <input
                id="reg-phone"
                inputMode="numeric"
                autoComplete="tel-national"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="手機號碼"
                className={cn(input, "min-w-0")}
              />
            </div>
            {err && <p className="text-xs text-destructive">{err}</p>}
            <button
              disabled={!phoneOk || busy}
              onClick={sendCode}
              className={primary}
              style={{ background: STRONG }}
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}SMS 收驗證碼
            </button>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex-1 h-px bg-border" />
              或者
              <span className="flex-1 h-px bg-border" />
            </div>
            <button onClick={() => go("signup")} className={outline}>
              用 email 登記
            </button>
            <button onClick={() => go("login")} className="w-full text-sm">
              已經用 email 登記過？
              <span className="font-black" style={{ color: STRONG }}>
                登入
              </span>
            </button>
            {mode === "local" && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <DemoBadge /> 示範版唔會真係寄 SMS，驗證碼打任何 6 個數字都得。
              </p>
            )}
            <Terms />
          </>
        )}

        {step === "otp" && (
          <>
            <p className="text-sm text-muted-foreground">
              驗證碼已經 SMS 去{" "}
              <b className="text-foreground">
                +852 {phone.slice(0, 4)} {phone.slice(4)}
              </b>
            </p>
            <label htmlFor="reg-code" className="sr-only">
              6 位數字驗證碼
            </label>
            <input
              id="reg-code"
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6 位數字"
              className={cn(input, "text-center text-2xl font-black tracking-[0.4em]")}
            />
            {err && <p className="text-xs text-destructive">{err}</p>}
            <button
              disabled={code.length !== 6 || busy}
              onClick={() =>
                run(async () => {
                  const r = await aah.verifyPhoneOtp(fullPhone, code);
                  if (r === "done") finish();
                  else setStep("profile");
                })
              }
              className={primary}
              style={{ background: STRONG }}
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}確認
            </button>
            <div className="flex items-center justify-between text-sm">
              <button onClick={() => go("start")} className="text-muted-foreground underline">
                改電話號碼
              </button>
              <Resend sentAt={sentAt} disabled={busy} onResend={sendCode} />
            </div>
          </>
        )}

        {step === "signup" && (
          <>
            {!sms && (
              <div className="flex items-center gap-3">
                <span
                  className="w-12 h-12 rounded-full grid place-items-center shrink-0"
                  style={{ background: SOFT, color: STRONG }}
                >
                  <Lock className="w-5 h-5" />
                </span>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  免費，30 秒搞掂。對方只會見到你個暱稱，唔會見到你個 email。
                </p>
              </div>
            )}
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              aria-label="Email"
              className={input}
            />
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密碼（最少 6 個字）"
              aria-label="密碼"
              className={input}
            />
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value.slice(0, 12))}
              placeholder="暱稱，例如 阿明"
              aria-label="暱稱"
              className={input}
            />
            {nickErr && <p className="text-xs text-destructive -mt-1">{nickErr}</p>}
            {mode === "local" && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <DemoBadge /> 示範版唔會真係建立帳戶。
              </p>
            )}
            {err && <p className="text-xs text-destructive">{err}</p>}
            <button
              disabled={!emailOk || password.length < 6 || !nickname.trim() || !!nickErr || busy}
              onClick={() =>
                run(async () => {
                  const r = await aah.signUpEmail(email.trim(), password, nickname.trim());
                  if (r === "confirm") {
                    setSentAt(Date.now());
                    setStep("checkEmail");
                  } else setStep("prefs");
                })
              }
              className={primary}
              style={{ background: STRONG }}
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}登記
            </button>
            {sms ? (
              <button onClick={() => go("start")} className="w-full text-sm text-muted-foreground">
                用 SMS 登記
              </button>
            ) : (
              <button onClick={() => go("login")} className="w-full text-sm">
                已經登記過？
                <span className="font-black" style={{ color: STRONG }}>
                  登入
                </span>
              </button>
            )}
            <Terms />
          </>
        )}

        {step === "login" && (
          <>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              aria-label="Email"
              className={input}
            />
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密碼"
              aria-label="密碼"
              className={input}
            />
            {err && <p className="text-xs text-destructive">{err}</p>}
            <button
              disabled={!emailOk || !password || busy}
              onClick={() =>
                run(async () => {
                  const r = await aah.signInEmail(email.trim(), password);
                  if (r === "need_profile") setStep("profile");
                  else finish();
                })
              }
              className={primary}
              style={{ background: "#2B2433" }}
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
            <button
              onClick={() => go(sms ? "start" : "signup")}
              className="w-full text-sm text-muted-foreground"
            >
              {sms ? "用 SMS 登入" : "未有帳戶？用 email 登記"}
            </button>
          </>
        )}

        {step === "checkEmail" && (
          <div className="space-y-4 text-center">
            <MailCheck className="w-12 h-12 mx-auto text-[#1E5C3F]" />
            <div className="font-bold">確認連結已經寄去 {email}</div>
            <p className="text-sm text-muted-foreground">
              打開 email，撳「確認 email」掣，再撳「確認我嘅 email」。確認完返嚟呢度登入，就會用「
              {nickname}
              」做暱稱。
            </p>
            <p className="text-[11px] text-muted-foreground">
              搵唔到就睇吓垃圾郵件。連結有時限，過咗期就再寄一次。
            </p>
            {err && <p className="text-xs text-destructive">{err}</p>}
            <button
              onClick={() => go("login")}
              className={primary}
              style={{ background: "#2B2433" }}
            >
              已經確認，去登入
            </button>
            <div className="text-sm" data-testid="resend-confirm">
              <Resend
                sentAt={sentAt}
                disabled={busy}
                label="冇收到？再寄一次"
                onResend={() =>
                  run(async () => {
                    await aah.resendConfirm(email.trim());
                    setSentAt(Date.now());
                    toast.success("已經再寄，睇吓 email");
                  })
                }
              />
            </div>
          </div>
        )}

        {step === "profile" && (
          <>
            <p className="text-sm text-muted-foreground">交收時對方會見到呢個名。</p>
            <input
              autoFocus
              value={nickname}
              onChange={(e) => setNickname(e.target.value.slice(0, 12))}
              placeholder="例如 阿明"
              aria-label="暱稱"
              className={input}
            />
            {nickErr && <p className="text-xs text-destructive -mt-1">{nickErr}</p>}
            {err && <p className="text-xs text-destructive">{err}</p>}
            <button
              disabled={!nickname.trim() || !!nickErr || busy}
              onClick={() =>
                run(async () => {
                  await aah.completeRegistration(phoneOk ? fullPhone : null, nickname.trim());
                  setStep("prefs");
                })
              }
              className={primary}
              style={{ background: STRONG }}
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}下一步
            </button>
          </>
        )}

        {step === "prefs" && <Prefs onDone={finish} />}
      </div>
    </BottomSheet>
  );
}

function Terms() {
  return (
    <p className="text-[11px] text-muted-foreground text-center">
      繼續即表示同意
      <Link to="/terms" className="underline mx-0.5">
        服務條款
      </Link>
      同
      <Link to="/privacy" className="underline mx-0.5">
        私隱政策
      </Link>
    </p>
  );
}

function Resend({
  sentAt,
  disabled,
  onResend,
  label = "重新寄驗證碼",
}: {
  sentAt: number;
  disabled: boolean;
  onResend: () => void;
  label?: string;
}) {
  const now = useNow(1000);
  const left = Math.max(0, Math.ceil((sentAt + 60_000 - now) / 1000));
  return (
    <button
      onClick={onResend}
      disabled={disabled || left > 0}
      className="font-bold disabled:text-muted-foreground disabled:font-normal"
      style={left > 0 ? undefined : { color: STRONG }}
    >
      {left > 0 ? `${left} 秒後可以重新寄` : label}
    </button>
  );
}

const DRIVES: { id: NonNullable<User["drives"]>; label: string }[] = [
  { id: "yes", label: "會" },
  { id: "sometimes", label: "有時" },
  { id: "no", label: "唔會" },
];
const SAVES: { id: NonNullable<User["saveCats"]>[number]; label: string }[] = [
  { id: "parking", label: "泊車" },
  { id: "dining", label: "食飯" },
  { id: "shopping", label: "買嘢" },
];

/** 登記後問幾樣：可以跳過；推廣通知預設唔剔，同條款分開問 */
function Prefs({ onDone }: { onDone: () => void }) {
  const { malls } = useAahMalls();
  const geo = useGeo();
  const [fav, setFav] = useState<string[]>([]);
  const [drives, setDrives] = useState<User["drives"]>();
  const [save, setSave] = useState<NonNullable<User["saveCats"]>>([]);
  const [promo, setPromo] = useState(false);

  const choices = useMemo(() => {
    if (geo.status === "ok" && geo.lat != null && geo.lng != null)
      return nearestMalls(malls, geo.lat, geo.lng, 8);
    return [...malls].sort((a, b) => (b.traffic ?? 0) - (a.traffic ?? 0)).slice(0, 8);
  }, [malls, geo.status, geo.lat, geo.lng]);

  const toggle = <T,>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  const chip = (on: boolean) =>
    cn(
      "h-10 px-3.5 rounded-full text-sm font-bold border transition-colors",
      on ? "text-white border-transparent" : "bg-card border-border",
    );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm">
        <span className="h-7 px-2.5 rounded-full bg-[#D6F2E2] text-[#1E5C3F] font-black inline-flex items-center gap-1">
          <Check className="w-3.5 h-3.5" strokeWidth={3} />
          登記好喇
        </span>
        <span className="text-muted-foreground">答咗，首頁會先出你啱用嘅着數。</span>
      </div>

      <div className="space-y-2">
        <div className="text-[15px] font-black">
          你通常去邊個商場？
          <span className="text-xs font-medium text-muted-foreground">（揀幾個都得）</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {choices.map((m) => {
            const on = fav.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={on}
                onClick={() => setFav((f) => toggle(f, m.id))}
                className={chip(on)}
                style={on ? { background: STRONG } : undefined}
              >
                {m.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-[15px] font-black">你會揸車去商場？</div>
        <div className="grid grid-cols-3 gap-2">
          {DRIVES.map((d) => {
            const on = drives === d.id;
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={on}
                onClick={() => setDrives(on ? undefined : d.id)}
                className={cn(chip(on), "h-12 rounded-2xl")}
                style={on ? { background: STRONG } : undefined}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-[15px] font-black">最想慳邊樣？</div>
        <div className="flex gap-2">
          {SAVES.map((s) => {
            const on = save.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={on}
                onClick={() => setSave((x) => toggle(x, s.id))}
                className={chip(on)}
                style={on ? { background: STRONG } : undefined}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-2xl bg-background px-4 py-3 text-sm leading-relaxed">
        <input
          type="checkbox"
          checked={promo}
          onChange={(e) => setPromo(e.target.checked)}
          className="w-5 h-5 mt-0.5 shrink-0 accent-[#3B2F8F]"
        />
        <span>
          有附近着數同商戶優惠，通知我
          <span className="block text-xs text-muted-foreground">可以隨時喺「我的」熄</span>
        </span>
      </label>

      <div className="space-y-1">
        <button
          onClick={() => {
            aah.updateUser({ favMalls: fav, drives, saveCats: save, notifyPromotions: promo });
            onDone();
          }}
          className={primary}
          style={{ background: STRONG }}
        >
          完成
        </button>
        <button onClick={onDone} className="w-full h-10 text-sm font-bold text-muted-foreground">
          遲啲先
        </button>
      </div>
    </div>
  );
}
