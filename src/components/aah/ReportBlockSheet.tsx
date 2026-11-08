import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Ban } from "lucide-react";
import { BottomSheet, Chip } from "@/components/aah/ui";
import { aah, aahErrorText } from "@/lib/aah/store";

const REASONS: { label: string; kind: string }[] = [
  { label: "冒犯、粗口或者騷擾", kind: "harass" },
  { label: "單據／飛／券係假，或者資料唔實", kind: "fake" },
  { label: "炒飛、私下加價（例如見面先話要加錢）", kind: "scalping" },
  { label: "要求預先轉數", kind: "prepay" },
  { label: "其他", kind: "other" },
];

/**
 * 舉報／封鎖（App Store 1.2、Google Play UGC 規定）
 * - 舉報會送去人手審核，同時封鎖對方
 * - 封鎖：雙方唔會再見到對方嘅 post、唔可以再互動；進行中嘅配對即刻取消（唔罰）
 */
export function ReportBlockSheet({
  open,
  onClose,
  targets,
  matchId,
  postId,
  onBlocked,
}: {
  open: boolean;
  onClose: () => void;
  targets: { userId: string; name: string }[];
  matchId?: string;
  postId?: string;
  onBlocked?: () => void;
}) {
  const [who, setWho] = useState<string | null>(targets[0]?.userId ?? null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setWho(targets[0]?.userId ?? null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const target = targets.find((t) => t.userId === who) ?? targets[0];

  async function run(p: Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await p;
      toast.success(ok);
      onClose();
      onBlocked?.();
    } catch (e) {
      toast.error(aahErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={() => !busy && onClose()} title="舉報／封鎖">
      <div className="space-y-3 pb-2">
        {targets.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {targets.map((t) => (
              <Chip key={t.userId} active={t.userId === target?.userId} onClick={() => setWho(t.userId)}>
                {t.name}
              </Chip>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground leading-relaxed">
          舉報會交俾我哋人手審核（24 小時內處理），同時封鎖{target ? `「${target.name}」` : "對方"}：你哋之後唔會再見到對方嘅 post，亦唔可以再互動；進行中嘅配對會即刻取消，唔會罰你。
        </p>
        {REASONS.map((r) => (
          <button
            key={r.kind}
            disabled={busy || !target}
            onClick={() =>
              target &&
              run(aah.report({ accusedId: target.userId, kind: r.kind, note: r.label, matchId, postId }), "已舉報並封鎖，我哋會人手跟進")
            }
            className="w-full h-12 rounded-2xl border border-border font-semibold text-left px-4 disabled:opacity-50"
          >
            {r.label}
          </button>
        ))}
        <button
          disabled={busy || !target}
          onClick={() => target && run(aah.blockUser(target.userId), `已封鎖「${target.name}」`)}
          className="w-full h-12 rounded-2xl bg-[#1a1a1a] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Ban className="w-4 h-4" /> 淨係封鎖，唔舉報
        </button>
        <p className="text-[11px] text-muted-foreground text-center">可以喺「我的配對」→「封鎖名單」解除封鎖</p>
      </div>
    </BottomSheet>
  );
}

/** 封鎖名單：睇返封鎖咗邊個，可以解除 */
export function BlockListSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [list, setList] = useState<{ userId: string; nickname: string }[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setList(null);
    aah.myBlocks().then(setList, (e) => {
      toast.error(aahErrorText(e));
      setList([]);
    });
  }, [open]);

  async function unblock(userId: string, name: string) {
    setBusy(userId);
    try {
      await aah.unblockUser(userId);
      setList((l) => (l ?? []).filter((b) => b.userId !== userId));
      toast.success(`已解除封鎖「${name}」`);
    } catch (e) {
      toast.error(aahErrorText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="封鎖名單">
      <div className="space-y-2 pb-2">
        {list == null ? (
          <p className="text-sm text-muted-foreground py-4 text-center">載入緊…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">你未封鎖任何人。</p>
        ) : (
          list.map((b) => (
            <div key={b.userId} className="flex items-center gap-3 bg-card rounded-2xl px-4 py-3">
              <span className="flex-1 font-semibold truncate">{b.nickname}</span>
              <button
                disabled={busy === b.userId}
                onClick={() => unblock(b.userId, b.nickname)}
                className="h-9 px-3 rounded-xl border border-border text-sm font-semibold disabled:opacity-50"
              >
                解除封鎖
              </button>
            </div>
          ))
        )}
        <p className="text-[11px] text-muted-foreground">封鎖咗嘅人唔會見到你嘅 post，亦唔可以同你互動；你都唔會見到佢嘅 post。</p>
      </div>
    </BottomSheet>
  );
}
