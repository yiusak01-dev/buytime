import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Camera, X, Loader2, AlertTriangle, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { raiseDispute, type DisputeReason } from "@/lib/escrow-db";
import { requireSignedIn } from "@/lib/auth-guard";

export const Route = createFileRoute("/dispute/$transactionId")({
  beforeLoad: requireSignedIn,
  head: () => ({
    meta: [
      { title: "提出爭議 — 買時間" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DisputePage,
});

const REASONS: [DisputeReason, string, string][] = [
  ["seller_no_show", "賣家冇出現", "約定時間地點賣家未有出現交收"],
  ["invalid_receipt", "收據無效 / 已用過", "收據已作廢、過期或被泊車系統拒收"],
  ["receipt_mismatch", "收據與 listing 不符", "商場、金額、付款方式與 listing 資料不一致"],
  ["other", "其他原因", "其他情況，請於下方詳述"],
];

const MAX_PHOTOS = 5;
const MAX_SIZE = 5 * 1024 * 1024;

type Tx = {
  id: string;
  buyer_id: string | null;
  seller_id: string | null;
  status: string | null;
  mall_name: string | null;
  sale_price: number | null;
};

type ExistingDispute = {
  id: string;
  status: string;
  evidence_deadline_at: string | null;
  reason: string;
  description: string | null;
};

function DisputePage() {
  const { transactionId } = Route.useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);
  const [tx, setTx] = useState<Tx | null>(null);
  const [existing, setExisting] = useState<ExistingDispute | null>(null);

  const [reason, setReason] = useState<DisputeReason>("seller_no_show");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        navigate({ to: "/auth" });
        return;
      }
      setMyId(auth.user.id);

      const { data: txRow, error } = await (supabase as any)
        .from("transactions")
        .select("id, buyer_id, seller_id, status, mall_name, sale_price")
        .eq("id", transactionId)
        .maybeSingle();

      if (error || !txRow) {
        toast.error("找不到交易紀錄");
        navigate({ to: "/transactions" });
        return;
      }
      setTx(txRow as Tx);

      const { data: dispute } = await (supabase as any)
        .from("disputes")
        .select("id, status, evidence_deadline_at, reason, description")
        .eq("transaction_id", transactionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (dispute) setExisting(dispute as ExistingDispute);
      setLoading(false);
    })();
  }, [transactionId, navigate]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const additions: File[] = [];
    for (const f of Array.from(files)) {
      if (f.size > MAX_SIZE) {
        toast.error(`相片 ${f.name} 超過 5MB`);
        continue;
      }
      additions.push(f);
    }
    setPhotos((prev) => [...prev, ...additions].slice(0, MAX_PHOTOS));
  }

  async function uploadEvidence(file: File): Promise<string | null> {
    if (!myId) return null;
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${myId}/${transactionId}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;
    const { error } = await (supabase as any).storage
      .from("dispute-evidence")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      console.error("[uploadEvidence]", error);
      toast.error(`上傳失敗：${file.name}`);
      return null;
    }
    const { data: signed } = await (supabase as any).storage
      .from("dispute-evidence")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    return signed?.signedUrl ?? path;
  }

  async function submit() {
    if (!myId || !tx || submitting) return;
    if (tx.buyer_id !== myId) {
      toast.error("只有買家可以提出爭議");
      return;
    }
    setSubmitting(true);
    try {
      const urls: string[] = [];
      for (const f of photos) {
        const u = await uploadEvidence(f);
        if (u) urls.push(u);
      }
      await raiseDispute({
        transaction_id: transactionId,
        reported_by: myId,
        reason,
        description: description.trim() || undefined,
        evidence_urls: urls.length ? urls : undefined,
      });
      toast.success("已提交爭議");
      const { data: dispute } = await (supabase as any)
        .from("disputes")
        .select("id, status, evidence_deadline_at, reason, description")
        .eq("transaction_id", transactionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (dispute) setExisting(dispute as ExistingDispute);
    } catch (e: any) {
      console.error(e);
      toast.error("提交失敗", { description: e?.message });
    } finally {
      setSubmitting(false);
    }
  }

  function formatCountdown(target: string | null) {
    if (!target) return "";
    const diff = Math.max(0, new Date(target).getTime() - now);
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isBuyer = myId === tx?.buyer_id;
  const alreadyRaised = !!existing;

  return (
    <div className="min-h-screen bg-background pb-10">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <Link to="/chat/$id" params={{ id: transactionId }} className="p-1 -ml-1">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-base font-bold">提出爭議</h1>
          <p className="text-[11px] text-muted-foreground">
            {tx?.mall_name ?? "交易"} · HK${tx?.sale_price ?? 0}
          </p>
        </div>
      </header>

      {alreadyRaised ? (
        <div className="p-4 space-y-4">
          <div className="bg-warning/10 border border-warning/30 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2 text-warning-foreground">
              <AlertTriangle className="w-5 h-5" />
              <h2 className="font-bold">爭議已提出</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              平台將於 24 小時內跟進，資金已凍結。
            </p>
            {existing?.evidence_deadline_at && (
              <div className="bg-card border border-border rounded-xl p-3 text-center">
                <div className="text-[11px] text-muted-foreground mb-1">補充證據截止倒計時</div>
                <div className="text-2xl font-mono font-bold tabular-nums">
                  {formatCountdown(existing.evidence_deadline_at)}
                </div>
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
            <div className="text-xs text-muted-foreground">爭議原因</div>
            <div className="font-semibold">
              {REASONS.find((r) => r[0] === existing?.reason)?.[1] ?? existing?.reason}
            </div>
            {existing?.description && (
              <>
                <div className="text-xs text-muted-foreground pt-2">你的說明</div>
                <div className="text-sm whitespace-pre-wrap">{existing.description}</div>
              </>
            )}
          </div>

          <Link
            to="/chat/$id"
            params={{ id: transactionId }}
            className="block w-full h-12 grid place-items-center border border-border rounded-xl text-sm font-semibold"
          >
            返回聊天室
          </Link>
        </div>
      ) : !isBuyer ? (
        <div className="p-4">
          <div className="bg-card border border-border rounded-2xl p-6 text-center">
            <ShieldCheck className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <h2 className="font-bold mb-2">只有買家可以提出爭議</h2>
            <p className="text-sm text-muted-foreground">
              如你係賣家想回應，請等買家先提出爭議。
            </p>
          </div>
        </div>
      ) : (
        <div className="p-4 space-y-5">
          <section>
            <h2 className="text-sm font-bold mb-2">選擇爭議原因 *</h2>
            <div className="space-y-2">
              {REASONS.map(([val, label, hint]) => (
                <button
                  key={val}
                  onClick={() => setReason(val)}
                  className={`w-full text-left p-3 rounded-xl border transition ${
                    reason === val
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="font-semibold text-sm">{label}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-bold mb-2">文字說明（選填）</h2>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="請描述發生咩事、雙方約定嘅交收時間地點、任何額外資料…"
              className="w-full border border-border rounded-xl p-3 text-sm resize-none bg-card"
            />
          </section>

          <section>
            <h2 className="text-sm font-bold mb-2">
              相片證據（選填，最多 {MAX_PHOTOS} 張，每張 ≤ 5MB）
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((f, i) => (
                <div key={i} className="relative aspect-square">
                  <img
                    src={URL.createObjectURL(f)}
                    className="w-full h-full object-cover rounded-lg"
                  />
                  <button
                    onClick={() =>
                      setPhotos((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white grid place-items-center"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <label className="aspect-square border-2 border-dashed border-border rounded-lg grid place-items-center cursor-pointer hover:bg-accent">
                  <Camera className="w-5 h-5 text-muted-foreground" />
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      addPhotos(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          </section>

          <div className="bg-muted/60 rounded-xl p-3 text-[11px] text-muted-foreground leading-relaxed">
            提交爭議後，交易狀態會變為「爭議進行中」，資金會凍結直至平台完成裁決。
            虛假舉報或濫用會影響帳號評分，嚴重者會被停權。
          </div>

          <button
            onClick={submit}
            disabled={submitting}
            className="w-full h-12 bg-destructive text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> 提交中…
              </>
            ) : (
              "提交爭議"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
