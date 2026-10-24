import { useState } from "react";
import { aah } from "@/lib/aah/store";
import { BottomSheet, DemoBadge } from "./ui";

/**
 * 30 秒註冊：香港手機號碼 → 驗證碼 → 暱稱。
 * 示範版唔會真係發短訊；正式版接 Supabase 電話驗證（需要設定短訊供應商）。
 */
export function RegisterSheet({ open, onClose, onDone, reason }: { open: boolean; onClose: () => void; onDone: () => void; reason?: string }) {
  const [step, setStep] = useState<"phone" | "otp" | "name">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");

  const phoneOk = /^[4-9]\d{7}$/.test(phone);

  function close() {
    setStep("phone");
    setOtp("");
    setErr("");
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={close} title="用手機號碼註冊">
      <div className="space-y-4 pb-2">
        {reason && <p className="text-sm text-muted-foreground">{reason}</p>}

        {step === "phone" && (
          <>
            <label className="block">
              <span className="text-sm font-bold">香港手機號碼</span>
              <div className="mt-2 flex items-center gap-2 border border-border rounded-2xl px-3 h-12 bg-background">
                <span className="text-sm font-semibold text-muted-foreground">+852</span>
                <input
                  inputMode="numeric"
                  autoFocus
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  placeholder="9123 4567"
                  className="flex-1 bg-transparent outline-none text-base tracking-wider"
                />
              </div>
            </label>
            <p className="text-[11px] text-muted-foreground">一個號碼一個帳戶。對方唔會見到你個電話號碼。</p>
            {err && <p className="text-xs text-destructive">{err}</p>}
            <button
              disabled={!phoneOk}
              onClick={() => (phoneOk ? setStep("otp") : setErr("請輸入 8 位香港手機號碼"))}
              className="w-full h-12 rounded-2xl bg-[#1a1a1a] text-white font-bold disabled:opacity-40"
            >
              發送驗證碼
            </button>
          </>
        )}

        {step === "otp" && (
          <>
            <div className="text-sm">驗證碼已發送到 +852 {phone.slice(0, 4)} {phone.slice(4)}</div>
            <input
              inputMode="numeric"
              autoFocus
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6 位數字"
              className="w-full h-12 border border-border rounded-2xl px-3 bg-background text-center text-xl tracking-[0.5em] outline-none"
            />
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <DemoBadge /> 示範版唔會真係發短訊，輸入任何 6 位數字就得。
            </p>
            <button
              disabled={otp.length !== 6}
              onClick={() => setStep("name")}
              className="w-full h-12 rounded-2xl bg-[#1a1a1a] text-white font-bold disabled:opacity-40"
            >
              確認
            </button>
          </>
        )}

        {step === "name" && (
          <>
            <label className="block">
              <span className="text-sm font-bold">改個暱稱</span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 12))}
                placeholder="例如 阿明"
                className="mt-2 w-full h-12 border border-border rounded-2xl px-3 bg-background outline-none"
              />
            </label>
            <button
              disabled={!name.trim()}
              onClick={() => {
                aah.register(`+852${phone}`, name.trim());
                setStep("phone");
                setOtp("");
                onDone();
              }}
              className="w-full h-12 rounded-2xl bg-[#F5C518] text-[#1a1a1a] font-bold disabled:opacity-40"
            >
              完成，繼續
            </button>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
