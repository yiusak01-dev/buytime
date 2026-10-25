import { useEffect, useState } from "react";
import { Bell, Share } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { usePush } from "@/lib/aah/push";
import { useAahMode, useAahState } from "@/lib/aah/store";

const DISMISS_KEY = "aah:pushPromptDismissedAt";
const DISMISS_DAYS = 3;

function dismissedRecently() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() - at < DISMISS_DAYS * 24 * 3600 * 1000;
  } catch {
    return false;
  }
}

function resultToast(r: string) {
  if (r === "on") toast.success("已開通知", { description: "閂咗 app 都會收到" });
  else if (r === "denied") toast.error("瀏覽器封鎖咗通知", { description: "要去瀏覽器或者手機設定開返通知權限" });
  else if (r === "ios-install") toast("iPhone 要先加到主畫面", { description: "Safari 撳分享 → 加至主畫面，再由主畫面開" });
  else if (r === "unsupported") toast.error("呢個瀏覽器唔支援推送通知");
  else toast.error("開唔到通知，遲啲再試");
}

/** 喺用家等緊對方嘅時候問開唔開通知（雲端模式、已登入、未開、冇拒絕過先出） */
export function PushPrompt({ reason, onShown }: { reason: string; onShown?: () => void }) {
  const mode = useAahMode();
  const { user } = useAahState();
  const p = usePush();
  const [hidden, setHidden] = useState(dismissedRecently);

  const visible = mode === "remote" && !!user.registered && p.ready && !p.on && !hidden && p.permission !== "denied" && p.support !== "unsupported";
  // 出現之後版面會變長：通知外面重新捲一次（例如對話要喺底部掣上面見到）
  useEffect(() => {
    if (visible) onShown?.();
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* 唔記得都冇問題 */
    }
    setHidden(true);
  };

  if (p.support === "ios-install") {
    return (
      <div className="bg-card rounded-2xl p-4 text-sm space-y-2 shadow-[var(--shadow-card)]">
        <div className="font-bold flex items-center gap-1.5"><Bell className="w-4 h-4" />想閂咗 app 都收到通知？</div>
        <div className="text-muted-foreground">
          iPhone 要先喺 Safari 撳 <Share className="inline w-3.5 h-3.5 -mt-0.5" /> 分享 →「加至主畫面」，再由主畫面個「啱」字開，先可以開通知。
        </div>
        <button onClick={dismiss} className="text-xs underline text-muted-foreground">知道喇</button>
      </div>
    );
  }

  return (
    <div className="bg-[#FFF6D6] border border-[#F5C518] rounded-2xl p-4 text-sm space-y-3">
      <div className="flex items-start gap-2">
        <Bell className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <div className="font-bold">開通知，唔使一直望住</div>
          <div className="text-[13px] text-[#5c4a00]">{reason}</div>
        </div>
      </div>
      <div className="flex gap-2">
        <button disabled={p.busy} onClick={() => void p.enable().then(resultToast)} className="flex-1 h-10 rounded-xl bg-[#1a1a1a] text-white font-bold disabled:opacity-50">
          {p.busy ? "開緊…" : "開通知"}
        </button>
        <button onClick={dismiss} className="h-10 px-4 rounded-xl border border-[#E5C64A] font-semibold">唔使</button>
      </div>
    </div>
  );
}

/** 「我的配對」設定入面嘅推送開關 */
export function PushSettingRow() {
  const mode = useAahMode();
  const { user } = useAahState();
  const p = usePush();
  if (mode !== "remote" || !user.registered) return null;

  const hint =
    p.support === "ios-install"
      ? "iPhone：Safari 撳分享 →「加至主畫面」，再由主畫面開先用得"
      : p.support === "unsupported"
        ? "呢個瀏覽器唔支援推送通知"
        : p.permission === "denied"
          ? "瀏覽器封鎖咗通知，要去瀏覽器或者手機設定開返"
          : "有人有興趣、配對成功、對方傳訊息，閂咗 app 都會收到";
  const disabled = p.busy || !p.ready || p.support === "ios-install" || p.support === "unsupported" || p.permission === "denied";

  return (
    <label className="flex items-center justify-between gap-3">
      <span>
        <span className="text-sm block">推送通知</span>
        <span className="text-[11px] text-muted-foreground block leading-snug">{hint}</span>
      </span>
      <Switch
        checked={p.on}
        disabled={disabled}
        onCheckedChange={(v) => {
          if (v) void p.enable().then(resultToast);
          else void p.disable().then(() => toast("已關推送通知"));
        }}
      />
    </label>
  );
}
