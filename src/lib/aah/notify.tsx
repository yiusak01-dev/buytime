// App 內提示：一次只出一個，新嘅頂走舊嘅；成張卡撳得，撳就去嗰版。
// 放喺頂部個標題列下面，唔會遮住「返上一頁」。
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";

/** 有人搵你（訊息、有興趣、配對成功）：黑色卡，撳就入去 */
export function notify(title: string, opts: { body?: string; onOpen?: () => void; duration?: number } = {}) {
  toast.custom(
    (id) => (
      <button
        type="button"
        data-testid="live-toast"
        onClick={() => {
          toast.dismiss(id);
          opts.onOpen?.();
        }}
        className="w-[calc(100vw-32px)] max-w-md flex items-center gap-3 rounded-2xl bg-[#1a1a1a] text-white px-4 py-3 shadow-lg text-left"
      >
        <span className="w-2 h-2 rounded-full bg-[#F5C518] shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-black truncate">{title}</span>
          {opts.body && <span className="block text-xs opacity-75 truncate">{opts.body}</span>}
        </span>
        {opts.onOpen && <ChevronRight className="w-4 h-4 shrink-0 opacity-70" />}
      </button>
    ),
    { id: "live", duration: opts.duration ?? 6000 },
  );
}

/** 撳完掣嘅確認：細細個、好快消失，新嘅頂走舊嘅 */
export function done(text: string, description?: string) {
  toast.success(text, { id: "done", description, duration: 1800 });
}
