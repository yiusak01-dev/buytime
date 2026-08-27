// v4.0 - seller-only cancel, realtime tx, delete conversation, read receipts
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Send, MoreVertical, Flag, ShieldOff, ShieldCheck, CheckCircle, X, Trash2, PackageCheck, AlertTriangle, Camera, Loader2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ownSupabase } from "@/integrations/supabase/own-client";
import { StatusBadge } from "@/components/StatusBadge";
import { formatHKD } from "@/lib/fees";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { markDeliveryConfirmed, markBuyerConfirmed, submitRating } from "@/lib/escrow-db";
import { isCreditCardPayment, SLIP_HINT_CHAT } from "@/lib/credit-slip";
import { sendPushToUser } from "@/lib/push";
import { cn } from "@/lib/utils";
import { requireSignedIn } from "@/lib/auth-guard";


export const Route = createFileRoute("/chat/$id")({
  beforeLoad: requireSignedIn,
  component: ChatPage,
});

type Message = {
  id: string;
  sender_id: string;
  sender_name: string | null;
  content: string;
  created_at: string;
  type: string;
  offer_amount: number | null;
  offer_status: string | null;
};

type Tx = {
  id: string;
  mall_name: string | null;
  sale_price: number | null;
  status: string | null;
  buyer_id: string | null;
  seller_id: string | null;
  listing_id: string | null;
  delivery_confirmed_at: string | null;
  delivery_photo_url: string | null;
  auto_release_at: string | null;
  buyer_confirmed_at: string | null;
};

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString("zh-HK", { hour: "2-digit", minute: "2-digit", hour12: false });
}

const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZHdmZ3VqaGpxZ255ZGlnd3V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMTM0MjMsImV4cCI6MjA5ODc4OTQyM30.Zx2prlmxNXhPB6YWHG09QZr7wiNqHIXvrRcYfrXMnBY";

function ChatPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [tx, setTx] = useState<Tx | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasSlip, setHasSlip] = useState(false);
  const [listingInfo, setListingInfo] = useState<{ receipt_amount: number; parking_hours: number; asking_price: number } | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [myName, setMyName] = useState<string>(t("chat.unknownUser"));
  const [chatImageUploading, setChatImageUploading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [sellerAssist, setSellerAssist] = useState(false);
  const [showParkingSheet, setShowParkingSheet] = useState(false);
  const [parkingPhoto, setParkingPhoto] = useState<File | null>(null);
  const [parkingPhotoPreview, setParkingPhotoPreview] = useState<string | null>(null);
  const [uploadingParking, setUploadingParking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const myIdRef = useRef<string | null>(null);
  useEffect(() => { myIdRef.current = myId; }, [myId]);

const [showCancelSheet, setShowCancelSheet] = useState(false);
  const [otherLastRead, setOtherLastRead] = useState<string | null>(null);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);

  const [hasReviewed, setHasReviewed] = useState(false);
  const [showRatingSheet, setShowRatingSheet] = useState(false);
  const [ratingKind, setRatingKind] = useState<"good" | "bad" | null>(null);
  const [ratingBadReason, setRatingBadReason] = useState<string>("");
  const [ratingComment, setRatingComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [opponentRating, setOpponentRating] = useState<{ rating: number; bad_reason: string | null; comment: string | null; revealed_at: string | null } | null>(null);


  const [showMenu, setShowMenu] = useState(false);
  const [showReportSheet, setShowReportSheet] = useState(false);
  const [showCompleteSheet, setShowCompleteSheet] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [isBlocked, setIsBlocked] = useState(false);

  // Escrow flow state
  const [showDeliverySheet, setShowDeliverySheet] = useState(false);
  const [showBuyerConfirmSheet, setShowBuyerConfirmSheet] = useState(false);
  const [deliveryPhoto, setDeliveryPhoto] = useState<File | null>(null);
  const [deliveryPhotoPreview, setDeliveryPhotoPreview] = useState<string | null>(null);
  const [uploadingDelivery, setUploadingDelivery] = useState(false);
  const [confirmingBuyer, setConfirmingBuyer] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);


  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id ?? null;
      if (!cancelled) setMyId(uid);

      if (uid) {
        const { data: userData } = await (supabase as any).from("users").select("display_name").eq("id", uid).maybeSingle();
        if (!cancelled && userData?.display_name) setMyName(userData.display_name);
      }

      const { data: txData } = await supabase.from("transactions" as any)
        .select("id, mall_name, sale_price, status, buyer_id, seller_id, listing_id, delivery_confirmed_at, delivery_photo_url, auto_release_at, buyer_confirmed_at").eq("id", id).maybeSingle();
      let txRow = (txData as unknown as Tx | null) ?? null;
      // Fallback: if seller_id is null (old transactions), get it from the listing
      if (txRow?.listing_id) {
        const { data: listingData } = await (supabase as any)
          .from("listings")
          .select("seller_id, receipt_serial, payment_method, receipt_amount, parking_hours, asking_price, seller_assist")
          .eq("id", txRow.listing_id)
          .maybeSingle();
        if (listingData && !txRow.seller_id && listingData.seller_id) {
          txRow = { ...txRow, seller_id: listingData.seller_id };
        }
        if (!cancelled && listingData) {
          setHasSlip(isCreditCardPayment(listingData.payment_method, listingData.receipt_serial));
          setSellerAssist(!!listingData.seller_assist);
          setListingInfo({
            receipt_amount: Number(listingData.receipt_amount ?? 0),
            parking_hours: Number(listingData.parking_hours ?? 0),
            asking_price: Number(listingData.asking_price ?? txRow?.sale_price ?? 0),
          });
        }
      }

      if (!cancelled) setTx(txRow);

      const { data: msgData } = await supabase.from("messages" as any)
        .select("id, sender_id, sender_name, content, created_at, type, offer_amount, offer_status")
        .eq("transaction_id", id).order("created_at", { ascending: true });
      if (!cancelled) setMsgs((msgData as unknown as Message[]) ?? []);

      if (uid) {
        await (supabase as any).from("chat_reads").upsert(
          { user_id: uid, transaction_id: id, last_read_at: new Date().toISOString() },
          { onConflict: "user_id,transaction_id" }
        );
        if (txRow) {
          const { data: rv } = await (supabase as any).from("ratings").select("id, rating, bad_reason, comment, revealed_at")
            .eq("transaction_id", id).eq("rater_id", uid).maybeSingle();
          if (!cancelled) setHasReviewed(!!rv?.id);

          const { data: opp } = await (supabase as any).from("ratings").select("rating, bad_reason, comment, revealed_at")
            .eq("transaction_id", id).neq("rater_id", uid).not("revealed_at", "is", null).maybeSingle();
          if (!cancelled) setOpponentRating(opp ?? null);


          const otherId = txRow.buyer_id === uid ? txRow.seller_id : txRow.buyer_id;
          if (otherId) {
            const { data: bl } = await (supabase as any).from("blocks").select("id")
              .eq("blocker_id", uid).eq("blocked_id", otherId).maybeSingle();
            if (!cancelled) setIsBlocked(!!bl?.id);
          }
        }
      }

      // Fetch other party's last_read_at for read receipts
      if (uid && txRow) {
        const otherId = txRow.buyer_id === uid ? txRow.seller_id : txRow.buyer_id;
        if (otherId) {
          const { data: readData } = await (supabase as any)
            .from("chat_reads")
            .select("last_read_at")
            .eq("user_id", otherId)
            .eq("transaction_id", id)
            .maybeSingle();
          if (!cancelled && readData?.last_read_at) setOtherLastRead(readData.last_read_at);
        }
      }

      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    const channel = supabase.channel(`chat-${id}`)
      .on("postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "messages", filter: `transaction_id=eq.${id}` },
        (payload: any) => {
          setMsgs((prev) => prev.find((m) => m.id === payload.new.id) ? prev : [...prev, payload.new as Message]);
          supabase.auth.getUser().then(({ data }) => {
            const uid = data.user?.id;
            if (uid) (supabase as any).from("chat_reads").upsert(
              { user_id: uid, transaction_id: id, last_read_at: new Date().toISOString() },
              { onConflict: "user_id,transaction_id" }
            ).then(() => {});
          });
        })
      .on("postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "messages", filter: `transaction_id=eq.${id}` },
        (payload: any) => {
          setMsgs((prev) => prev.map((m) => m.id === payload.new.id ? { ...m, ...payload.new } : m));
        })
      .on("postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "transactions", filter: `id=eq.${id}` },
        (payload: any) => {
          setTx((prev) => prev ? { ...prev, ...payload.new } : prev);
        })
      .on("postgres_changes" as any,
        { event: "*", schema: "public", table: "chat_reads", filter: `transaction_id=eq.${id}` },
        (payload: any) => {
          const row = payload.new;
          if (row?.user_id && row.user_id !== myIdRef.current) {
            setOtherLastRead(row.last_read_at ?? null);
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  function notifyOther(preview: string) {
    if (!tx || !myId) return;
    const otherId = tx.buyer_id === myId ? tx.seller_id : tx.buyer_id;
    if (!otherId) return;
    fetch("https://vyhgpklfpizsjpaxsbvb.supabase.co/functions/v1/notify-seller", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ recipient_id: otherId, transaction_id: id, mall_name: tx.mall_name ?? t("chat.mallFallback"), sender_name: myName, type: "message", message_preview: preview }),
    }).catch(console.warn);

    void sendPushToUser({
      recipient_id: otherId,
      title: `買時間 💬 ${myName}`,
      body: preview.length > 50 ? `${preview.slice(0, 50)}...` : preview,
      chat_id: id,
    });
  }


  async function send() {
    const text = input.trim();
    if (!text || !myId || sending) return;
    setSending(true);
    setInput("");

    // Optimistic update — show message immediately without waiting for realtime
    const msgId = crypto.randomUUID();
    const optimistic: Message = {
      id: msgId,
      sender_id: myId,
      sender_name: myName,
      content: text,
      created_at: new Date().toISOString(),
      type: "text",
      offer_amount: null,
      offer_status: null,
    };
    setMsgs((prev) => [...prev, optimistic]);

    const { error } = await supabase.from("messages" as any).insert({
      id: msgId,
      transaction_id: id,
      sender_id: myId,
      sender_name: myName,
      content: text,
      type: "text",
    });

    setSending(false);

    if (error) {
      // Roll back optimistic message on failure
      setMsgs((prev) => prev.filter((m) => m.id !== msgId));
      toast.error(t("chat.sendRetry"));
      return;
    }

    notifyOther(text);
  }




  async function completeTransaction() {
    const { error } = await (supabase as any).from("transactions").update({ status: "completed" }).eq("id", id);
    if (error) {
      console.error("[completeTransaction] failed:", error);
      toast.error(t("chat.updateFailed"));
      return;
    }
    if (tx?.listing_id) {
      await (supabase as any).from("listings").update({ status: "sold" }).eq("id", tx.listing_id);
    }
    setTx((prev) => prev ? { ...prev, status: "completed" } : prev);
    toast.success(t("chat.completeToast"));
  }

  async function cancelTransaction() {
    const { error } = await (supabase as any).from("transactions").update({ status: "cancelled" }).eq("id", id);
    if (error) {
      console.error("[cancelTransaction] failed:", error);
      toast.error(t("chat.cancelRetry"));
      return;
    }
    if (tx?.listing_id) {
      await (supabase as any).from("listings").update({ status: "active" }).eq("id", tx.listing_id);
    }
    setTx((prev) => prev ? { ...prev, status: "cancelled" } : prev);
    toast.info(t("chat.cancelSuccess"));
  }

  async function deleteConversation() {
    if (!myId || !tx) return;
    const field = myId === tx.buyer_id ? "hidden_by_buyer" : "hidden_by_seller";
    const { error } = await (supabase as any).from("transactions").update({ [field]: true }).eq("id", id);
    if (error) {
      console.error("[deleteConversation] failed:", error);
      toast.error(t("chat.deleteRetry"));
      return;
    }
    navigate({ to: "/chats" as any });
    toast.success(t("chat.deleteSuccess"));
  }


  async function submitReview() {
    if (!ratingKind || !myId || !tx) return;
    if (ratingKind === "bad" && !ratingBadReason) {
      toast.error(t("chat.badReasonRequired"));
      return;
    }
    setSubmittingReview(true);
    const reviewedId = tx.buyer_id === myId ? tx.seller_id : tx.buyer_id;
    if (!reviewedId) { toast.error(t("chat.opponentNotFound")); setSubmittingReview(false); return; }
    try {
      await submitRating({
        transaction_id: id,
        rater_id: myId,
        ratee_id: reviewedId,
        rating: ratingKind === "good" ? 5 : 1,
        bad_reason: ratingKind === "bad" ? ratingBadReason : undefined,
        comment: ratingComment.trim() || undefined,
      });
      setHasReviewed(true);
      setShowRatingSheet(false);
      toast.success(t("chat.rateSubmittedToast"));
      // Re-check for opponent reveal
      const { data: opp } = await (supabase as any).from("ratings").select("rating, bad_reason, comment, revealed_at")
        .eq("transaction_id", id).neq("rater_id", myId).not("revealed_at", "is", null).maybeSingle();
      if (opp) setOpponentRating(opp);
    } catch (e: any) {
      toast.error(e?.message ?? t("chat.submitRetry"));
    }
    setSubmittingReview(false);
  }


  async function reportUser() {
    if (!reportReason.trim() || !myId || !tx) return;
    const reportedId = tx.buyer_id === myId ? tx.seller_id : tx.buyer_id;
    if (!reportedId) {
      toast.error("找不到被檢舉對象");
      setShowReportSheet(false);
      return;
    }
    const { error } = await (supabase as any).from("reports").insert({
      reporter_id: myId,
      reported_id: reportedId,
      transaction_id: id,
      reason: reportReason.trim(),
    });
    if (error) {
      console.error("[reportUser]", error);
      toast.error("提交失敗，請重試", { description: error.message });
      return;
    }
    setShowReportSheet(false);
    setReportReason("");
    toast.success(t("chat.reportSubmittedToast"));
  }


  async function blockUser() {
    if (!myId || !tx) return;
    const blockedId = tx.buyer_id === myId ? tx.seller_id : tx.buyer_id;
    await (supabase as any).from("blocks").insert({ blocker_id: myId, blocked_id: blockedId });
    setIsBlocked(true); setShowMenu(false); toast.success(t("chat.blockedToast"));
  }

  async function unblockUser() {
    if (!myId || !tx) return;
    const blockedId = tx.buyer_id === myId ? tx.seller_id : tx.buyer_id;
    await (supabase as any).from("blocks").delete().eq("blocker_id", myId).eq("blocked_id", blockedId);
    setIsBlocked(false); setShowMenu(false); toast.success(t("chat.unblockedToast"));
  }

  async function uploadDeliveryPhoto(file: File): Promise<string | null> {
    if (!myId) return null;
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${myId}/${id}-${Date.now()}.${ext}`;
    const { error: upErr } = await (supabase as any).storage
      .from("delivery-photos")
      .upload(path, file, { upsert: false, contentType: file.type });
    if (upErr) {
      console.error("[uploadDeliveryPhoto] failed:", upErr);
      toast.error(t("chat.photoUploadFailed"), { description: upErr.message });
      return null;
    }
    const { data: signed } = await (supabase as any).storage
      .from("delivery-photos")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    return signed?.signedUrl ?? path;
  }

  async function uploadChatImage(file: File): Promise<string | null> {
    if (!myId) return null;
    const ext = file.name.split(".").pop() || "jpg";
    const path = `chat/${myId}/${id}-${Date.now()}.${ext}`;
    const { error } = await (supabase as any).storage
      .from("delivery-photos")
      .upload(path, file, { upsert: false, contentType: file.type });
    if (error) { toast.error("圖片上傳失敗"); return null; }
    const { data: signed } = await (supabase as any).storage
      .from("delivery-photos")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    return signed?.signedUrl ?? null;
  }

  async function sendImage(file: File) {
    if (!myId || chatImageUploading) return;
    setChatImageUploading(true);
    const url = await uploadChatImage(file);
    if (!url) { setChatImageUploading(false); return; }
    const msgId = crypto.randomUUID();
    const optimistic: Message = {
      id: msgId, sender_id: myId, sender_name: myName,
      content: url, created_at: new Date().toISOString(),
      type: "image", offer_amount: null, offer_status: null,
    };
    setMsgs((prev) => [...prev, optimistic]);
    await supabase.from("messages" as any).insert({
      id: msgId, transaction_id: id, sender_id: myId,
      sender_name: myName, content: url, type: "image",
    } as any);
    notifyOther("📷 圖片");
    setChatImageUploading(false);
  }



  async function confirmDelivery() {
    if (!myId || !tx || uploadingDelivery) return;
    setUploadingDelivery(true);
    try {
      let photoUrl: string | undefined;
      if (deliveryPhoto) {
        const url = await uploadDeliveryPhoto(deliveryPhoto);
        if (!url) { setUploadingDelivery(false); return; }
        photoUrl = url;
      }
      await markDeliveryConfirmed(id, photoUrl);
      const auto = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      setTx((prev) => prev ? {
        ...prev,
        status: "delivery_confirmed",
        delivery_confirmed_at: new Date().toISOString(),
        delivery_photo_url: photoUrl ?? null,
        auto_release_at: auto,
      } : prev);
      setShowDeliverySheet(false);
      setDeliveryPhoto(null);
      setDeliveryPhotoPreview(null);
      toast.success(t("chat.deliveryMarked"));
    } catch (e: any) {
      console.error(e);
      toast.error(t("chat.updateFailed"), { description: e?.message });
    } finally {
      setUploadingDelivery(false);
    }
  }

  async function confirmParking() {
    if (!myId || !tx || uploadingParking || !parkingPhoto) return;
    setUploadingParking(true);
    try {
      const ext = parkingPhoto.name.split(".").pop() || "jpg";
      const path = `parking/${myId}/${id}-${Date.now()}.${ext}`;
      const { error: upErr } = await (supabase as any).storage
        .from("delivery-photos")
        .upload(path, parkingPhoto, { upsert: false, contentType: parkingPhoto.type });
      if (upErr) { toast.error("相片上傳失敗"); setUploadingParking(false); return; }
      const { data: signed } = await (supabase as any).storage
        .from("delivery-photos")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      const photoUrl = signed?.signedUrl;
      if (!photoUrl) { toast.error("相片處理失敗"); setUploadingParking(false); return; }

      await markDeliveryConfirmed(id, photoUrl);
      const auto = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      setTx((prev) => prev ? {
        ...prev,
        status: "delivery_confirmed",
        delivery_confirmed_at: new Date().toISOString(),
        delivery_photo_url: photoUrl,
        auto_release_at: auto,
      } : prev);

      const msgId = crypto.randomUUID();
      const optimistic: Message = {
        id: msgId, sender_id: myId, sender_name: myName,
        content: photoUrl, created_at: new Date().toISOString(),
        type: "image", offer_amount: null, offer_status: null,
      };
      setMsgs((prev) => [...prev, optimistic]);
      await supabase.from("messages" as any).insert({
        id: msgId, transaction_id: id, sender_id: myId,
        sender_name: myName, content: photoUrl, type: "image",
      } as any);
      notifyOther("📷 泊車確認相片");

      setShowParkingSheet(false);
      setParkingPhoto(null);
      setParkingPhotoPreview(null);
      toast.success("泊車確認已提交，相片已發送給買家");
    } catch (e: any) {
      toast.error("提交失敗", { description: e?.message });
    } finally {
      setUploadingParking(false);
    }
  }

  async function buyerConfirm(auto = false) {
    if (!myId || !tx || confirmingBuyer) return;
    setConfirmingBuyer(true);
    try {
      await markBuyerConfirmed(id);
      if (tx.listing_id) {
        await (supabase as any).from("listings").update({ status: "sold" }).eq("id", tx.listing_id);
      }
      setTx((prev) => prev ? {
        ...prev,
        status: auto ? "auto_released" : "buyer_confirmed",
        buyer_confirmed_at: new Date().toISOString(),
      } : prev);
      setShowBuyerConfirmSheet(false);
      toast.success(auto ? t("chat.autoReleased") : t("chat.buyerConfirmedToast"));
    } catch (e: any) {
      console.error(e);
      toast.error(t("chat.confirmFailed"), { description: e?.message });
    } finally {
      setConfirmingBuyer(false);
    }
  }




  // Auto-release trigger: buyer's client fires when countdown hits zero
  const autoReleaseAtMs = tx?.auto_release_at ? new Date(tx.auto_release_at).getTime() : null;
  useEffect(() => {
    if (tx?.status !== "delivery_confirmed" || !autoReleaseAtMs) return;
    if (myId !== tx?.buyer_id) return;
    if (now >= autoReleaseAtMs && !confirmingBuyer) {
      buyerConfirm(true);
    }
  }, [now, autoReleaseAtMs, tx?.status, tx?.buyer_id, myId]);

  const isBuyer = myId === tx?.buyer_id;
  const isSeller = myId === tx?.seller_id;
  const isCompleted = tx?.status === "completed" || tx?.status === "buyer_confirmed" || tx?.status === "auto_released";
  const isCancelled = tx?.status === "cancelled";
  const isPaidHeld = tx?.status === "paid_held";
  const isDeliveryConfirmed = tx?.status === "delivery_confirmed";
  const countdownMs = autoReleaseAtMs ? Math.max(0, autoReleaseAtMs - now) : 0;
  const countdown = `${String(Math.floor(countdownMs / 60000)).padStart(2, "0")}:${String(Math.floor((countdownMs % 60000) / 1000)).padStart(2, "0")}`;
  const lastReadMsgId = (() => {
    if (!otherLastRead || !myId) return null;
    const myMsgs = msgs.filter((m) => m.sender_id === myId);
    const readMsgs = myMsgs.filter((m) => new Date(m.created_at) <= new Date(otherLastRead));
    return readMsgs.length > 0 ? readMsgs[readMsgs.length - 1].id : null;
  })();

  if (loading) return (
    <div className="flex flex-col min-h-dvh">
      <header className="sticky top-0 z-30 bg-card border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate({ to: "/chats" as any })} className="w-8 h-8 grid place-items-center"><ArrowLeft className="w-5 h-5" /></button>
        <div className="text-sm font-bold">{t("chat.headerTitle")}</div>
      </header>
      <div className="p-6 text-center text-muted-foreground text-sm">{t("chat.loading")}</div>
    </div>
  );

  if (!tx) return (
    <div className="flex flex-col min-h-dvh">
      <header className="sticky top-0 z-30 bg-card border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate({ to: "/chats" as any })} className="w-8 h-8 grid place-items-center"><ArrowLeft className="w-5 h-5" /></button>
        <div className="text-sm font-bold">{t("chat.headerTitle")}</div>
      </header>
      <div className="p-6 text-center text-muted-foreground text-sm">{t("chat.notFound")}</div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-dvh pb-0" onClick={() => showMenu && setShowMenu(false)}>
      <header className="sticky top-0 z-30 bg-card border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate({ to: "/chats" as any })} className="w-8 h-8 grid place-items-center"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold truncate">{tx.mall_name ?? t("chat.fallbackMall")}</div>
          <div className="text-[10px] text-muted-foreground flex items-center gap-2">
            <StatusBadge status={(tx.status as any) ?? "active"} />
            {tx.sale_price != null && <span>{formatHKD(tx.sale_price)}</span>}
          </div>
        </div>
        <div className="relative">
          <button onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v); }} className="w-8 h-8 grid place-items-center rounded-full hover:bg-accent">
            <MoreVertical className="w-5 h-5 text-muted-foreground" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-10 z-50 bg-card border border-border rounded-xl shadow-lg w-40 overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => { setShowMenu(false); setShowReportSheet(true); }} className="w-full text-left px-4 py-3 text-sm flex items-center gap-2 hover:bg-accent text-destructive">
                <Flag className="w-4 h-4" /> {t("chat.menuReport")}
              </button>
              <div className="border-t border-border" />
              {isBlocked ? (
                <button onClick={unblockUser} className="w-full text-left px-4 py-3 text-sm flex items-center gap-2 hover:bg-accent">
                  <ShieldCheck className="w-4 h-4" /> {t("chat.menuUnblock")}
                </button>
              ) : (
                <button onClick={blockUser} className="w-full text-left px-4 py-3 text-sm flex items-center gap-2 hover:bg-accent">
                  <ShieldOff className="w-4 h-4" /> {t("chat.menuBlock")}
                </button>
              )}
              <div className="border-t border-border" />
              <button onClick={() => { setShowMenu(false); setShowDeleteSheet(true); }} className="w-full text-left px-4 py-3 text-sm flex items-center gap-2 hover:bg-accent">
                <Trash2 className="w-4 h-4" /> {t("chat.menuDelete")}
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="bg-primary/5 border-b border-primary/10 px-4 py-2 text-xs text-primary/80 text-center">
        {t("chat.betaBanner")}
      </div>

      {hasSlip && (
        <div className="bg-primary/10 border-b border-primary/20 px-4 py-2 text-xs font-medium text-primary text-center">
          {SLIP_HINT_CHAT}
        </div>
      )}

      {listingInfo && (
        <div className="border-b border-border bg-card">
          <button
            onClick={() => setSummaryOpen((v) => !v)}
            className="w-full px-4 py-2 flex items-center justify-between text-xs font-semibold text-muted-foreground"
          >
            <span>{t("chat.viewReceipt")}</span>
            <span>{summaryOpen ? "▲" : "▼"}</span>
          </button>
          {summaryOpen && (
            <div className="px-4 pb-3 space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">{t("chat.spendAmount")}</span><span className="font-semibold">{formatHKD(listingInfo.receipt_amount)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("chat.freeParking")}</span><span className="font-semibold">{t("chat.hoursValue", { hours: listingInfo.parking_hours })}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("chat.askingPrice")}</span><span className="font-semibold text-success">{formatHKD(listingInfo.asking_price)}</span></div>
            </div>
          )}
        </div>
      )}




      {/* Escrow: seller "已交收" when payment held */}
      {isPaidHeld && isSeller && (
        <div className="border-b border-border px-4 py-3 bg-primary/5">
          <button
            onClick={() => (sellerAssist ? setShowParkingSheet(true) : setShowDeliverySheet(true))}
            className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
          >
            <PackageCheck className="w-4 h-4" />
            {sellerAssist ? "提交泊車確認相片" : t("chat.sellerDelivered")}
          </button>
          <p className="text-[11px] text-muted-foreground text-center mt-2">
            {sellerAssist
              ? "到領展服務處辦理泊車優惠後，即影確認單上傳"
              : t("chat.sellerDeliveredHint")}
          </p>
        </div>
      )}
      {isPaidHeld && isBuyer && (
        <div className="border-b border-border px-4 py-2 bg-primary/5 text-center text-xs text-primary/80">
          {sellerAssist
            ? "🅿️ 賣家將代辦泊車優惠，請在聊天室提供您的車牌號碼"
            : t("chat.buyerHeldWaiting")}
        </div>
      )}

      {/* Escrow: after seller marks delivered */}
      {isDeliveryConfirmed && isSeller && (
        <div className="border-b border-border px-4 py-3 bg-warning/5 text-center">
          <div className="text-xs text-muted-foreground">{t("chat.sellerWaitingBuyer")}</div>
          <div className="text-lg font-bold tabular-nums">{t("chat.remaining", { time: countdown })}</div>
          <div className="text-[10px] text-muted-foreground mt-1">{t("chat.autoReleaseNote")}</div>
        </div>
      )}
      {isDeliveryConfirmed && isBuyer && (
        <div className="border-b border-border px-4 py-3 bg-warning/5 space-y-2">
          <div className="text-center">
            <div className="text-[11px] text-muted-foreground">{t("chat.buyerCountdownLabel")}</div>
            <div className="text-lg font-bold tabular-nums">{countdown}</div>
          </div>
          {tx?.delivery_photo_url && (
            <a href={tx.delivery_photo_url} target="_blank" rel="noreferrer" className="block text-[11px] text-primary underline text-center">
              {t("chat.viewDeliveryProof")}
            </a>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setShowBuyerConfirmSheet(true)}
              disabled={confirmingBuyer}
              className="flex-1 bg-success text-white py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1 disabled:opacity-50"
            >
              <CheckCircle className="w-3.5 h-3.5" /> {t("chat.buyerConfirmReceipt")}
            </button>
            <button
              onClick={() => navigate({ to: "/dispute/$transactionId", params: { transactionId: id } })}
              className="flex-1 bg-destructive/10 text-destructive py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1"
            >
              <AlertTriangle className="w-3.5 h-3.5" /> {t("chat.raiseDispute")}
            </button>
          </div>
        </div>
      )}

      {/* Legacy manual complete/cancel (only for non-escrow statuses e.g. old "active" transactions) */}
      {!isCompleted && !isCancelled && !isPaidHeld && !isDeliveryConfirmed && tx?.status !== "disputed" && (
        <div className="border-b border-border px-4 py-2 flex items-center gap-2">
          <button
            onClick={() => setShowCompleteSheet(true)}
            className="flex-1 text-xs bg-success text-white py-2 rounded-lg font-semibold flex items-center justify-center gap-1"
          >
            <CheckCircle className="w-3.5 h-3.5" /> {t("chat.completeTx")}
          </button>
          {isSeller && (
            <button
              onClick={() => setShowCancelSheet(true)}
              className="flex-1 text-xs bg-destructive/10 text-destructive py-2 rounded-lg font-semibold flex items-center justify-center gap-1"
            >
              <X className="w-3.5 h-3.5" /> {t("chat.cancelTx")}
            </button>
          )}
        </div>
      )}
      {tx?.status === "disputed" && (
        <button
          onClick={() => navigate({ to: "/dispute/$transactionId", params: { transactionId: id } })}
          className="w-full bg-warning/10 border-b border-warning/30 px-4 py-2 text-center text-xs text-warning-foreground font-semibold"
        >
          {t("chat.disputedBanner")}
        </button>
      )}
      {tx?.status === "resolved_refund" && (
        <div className="bg-info/10 border-b border-info/30 px-4 py-2 text-center text-xs font-semibold">
          {t("chat.resolvedRefund")}
        </div>
      )}
      {tx?.status === "resolved_release" && (
        <div className="bg-success/10 border-b border-success/30 px-4 py-2 text-center text-xs font-semibold">
          {t("chat.resolvedRelease")}
        </div>
      )}
      {isCancelled && (
        <div className="bg-destructive/5 border-b border-destructive/20 px-4 py-2 text-center text-xs text-destructive">
          {t("chat.cancelledBanner")}
        </div>
      )}

      {isCompleted && !hasReviewed && (
        <div className="bg-success/10 border-b border-success/20 px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-success font-medium">{t("chat.ratePrompt")}</span>
          <button onClick={() => setShowRatingSheet(true)} className="text-xs bg-success text-white px-3 py-1.5 rounded-lg font-semibold">
            {t("chat.rateBtn")}
          </button>
        </div>
      )}
      {isCompleted && hasReviewed && !opponentRating && (
        <div className="bg-success/10 border-b border-success/20 px-4 py-2 text-center text-xs text-success">
          {t("chat.rateSubmittedWait")}
        </div>
      )}
      {isCompleted && hasReviewed && opponentRating && (
        <div className="bg-card border-b border-border px-4 py-3">
          <div className="text-xs font-semibold mb-1">{t("chat.opponentRatingTitle")}</div>
          <div className="text-sm">
            {opponentRating.rating === 5 ? t("chat.ratingGood") : t("chat.ratingBadWithReason", { reason: opponentRating.bad_reason ?? "" })}
          </div>
          {opponentRating.comment && (
            <div className="text-xs text-muted-foreground mt-1">「{opponentRating.comment}」</div>
          )}
        </div>
      )}


      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {msgs.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-6">{t("chat.emptyMsgs")}</div>
        )}
        {msgs.map((m) => {
          const mine = m.sender_id === myId;

          if (m.type === "offer") {
            const mine = m.sender_id === myId;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                {!mine && (
                  <div className="w-7 h-7 rounded-full bg-accent grid place-items-center text-xs font-bold mr-2 shrink-0">
                    {(m.sender_name ?? "?")[0].toUpperCase()}
                  </div>
                )}
                <div className="max-w-[75%]">
                  {!mine && <div className="text-[10px] text-muted-foreground mb-0.5 ml-1">{m.sender_name ?? t("chat.otherParty")}</div>}
                  <div className={`rounded-2xl px-3.5 py-2 text-sm ${mine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-card text-foreground rounded-bl-sm shadow-[var(--shadow-card)]"}`}>
                    {m.content}
                    <div className={`text-[10px] mt-0.5 ${mine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>{formatTime(m.created_at)}</div>
                  </div>
                  {mine && m.id === lastReadMsgId && (
                    <div className="text-[10px] text-muted-foreground text-right pr-1 mt-0.5">{t("chat.readReceipt")}</div>
                  )}
                </div>
              </div>
            );
          }

          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              {!mine && (
                <div className="w-7 h-7 rounded-full bg-accent grid place-items-center text-xs font-bold mr-2 shrink-0">
                  {(m.sender_name ?? "?")[0].toUpperCase()}
                </div>
              )}
              <div className="max-w-[75%]">
                {!mine && <div className="text-[10px] text-muted-foreground mb-0.5 ml-1">{m.sender_name ?? t("chat.otherParty")}</div>}
                <div className={`rounded-2xl px-3.5 py-2 text-sm ${mine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-card text-foreground rounded-bl-sm shadow-[var(--shadow-card)]"}`}>
                  {m.type === "image" ? (
                    <img
                      src={m.content}
                      alt="圖片"
                      className="rounded-xl max-w-[200px] max-h-[200px] object-cover cursor-pointer"
                      onClick={() => setLightboxUrl(m.content)}
                    />
                  ) : (
                    <>{m.content}</>
                  )}
                  <div className={`text-[10px] mt-0.5 ${mine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>{formatTime(m.created_at)}</div>
                </div>
                {mine && m.id === lastReadMsgId && (
                  <div className="text-[10px] text-muted-foreground text-right pr-1 mt-0.5">{t("chat.readReceipt")}</div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {isBlocked ? (
        <div className="sticky bottom-0 bg-card border-t border-border p-4 text-center text-xs text-muted-foreground">
          {t("chat.blockedInput")}
        </div>
      ) : isCancelled ? (
        <div className="sticky bottom-0 bg-card border-t border-border p-4 text-center text-xs text-muted-foreground">
          {t("chat.cancelledInput")}
        </div>
      ) : (
        <div className="sticky bottom-0 bg-card border-t border-border">
          {isBuyer && msgs.length === 0 && (
            <div className="px-3 pt-3 flex gap-2 flex-wrap">
              {[t("chat.quickReply1"), t("chat.quickReply3"), t("chat.quickReply4")].map((q) => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="text-[11px] px-3 py-1.5 rounded-full bg-accent text-accent-foreground font-medium"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          <div className="p-3 flex items-center gap-2">
          <label className={cn("w-10 h-10 rounded-full bg-accent grid place-items-center cursor-pointer shrink-0", chatImageUploading && "opacity-40 pointer-events-none")}>
            {chatImageUploading ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : <Camera className="w-4 h-4 text-muted-foreground" />}
            <input type="file" accept="image/*" capture="environment" className="hidden" disabled={chatImageUploading}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) sendImage(f); }} />
          </label>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder={t("chat.msgPlaceholder")}
            className="flex-1 bg-accent rounded-full px-4 py-2.5 text-sm outline-none"
            disabled={sending}
          />
          <button onClick={send} disabled={!input.trim() || sending} className="w-10 h-10 rounded-full bg-primary text-primary-foreground grid place-items-center disabled:opacity-40">
            <Send className="w-4 h-4" />
          </button>
          </div>
        </div>
      )}


      {showCancelSheet && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowCancelSheet(false)}>
          <div className="w-full bg-card rounded-t-3xl p-6 pb-10" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-border rounded-full mx-auto mb-4" />
            <h3 className="text-base font-bold mb-2">{t("chat.cancelSheetTitle")}</h3>
            <p className="text-sm text-muted-foreground mb-6">{t("chat.cancelSheetDesc")}</p>
            <div className="flex gap-3">
              <button onClick={() => setShowCancelSheet(false)} className="flex-1 h-12 border border-border rounded-xl text-sm font-semibold">{t("common.back")}</button>
              <button onClick={() => { setShowCancelSheet(false); cancelTransaction(); }} className="flex-1 h-12 bg-destructive text-white rounded-xl text-sm font-bold">{t("chat.cancelExchangeBtn")}</button>
            </div>
          </div>
        </div>
      )}

      {showRatingSheet && (() => {
        const iAmBuyer = tx?.buyer_id === myId;
        const badReasons = iAmBuyer
          ? [t("chat.brBuyer1"), t("chat.brBuyer2"), t("chat.brBuyer3"), t("chat.brBuyer4"), t("chat.brBuyer5")]
          : [t("chat.brSeller1"), t("chat.brSeller2"), t("chat.brSeller3"), t("chat.brSeller4")];
        return (
          <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowRatingSheet(false)}>
            <div className="w-full bg-card rounded-t-3xl p-6 pb-10" onClick={(e) => e.stopPropagation()}>
              <div className="w-10 h-1 bg-border rounded-full mx-auto mb-4" />
              <h3 className="text-base font-bold mb-1">{t("chat.rateSheetTitle")}</h3>
              <p className="text-xs text-muted-foreground mb-4">{t("chat.rateSheetHint")}</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <button
                  onClick={() => { setRatingKind("good"); setRatingBadReason(""); }}
                  className={`h-16 rounded-2xl text-2xl font-bold border-2 ${ratingKind === "good" ? "border-success bg-success/10" : "border-border"}`}
                >
                  {t("chat.rateGoodBtn")}
                </button>
                <button
                  onClick={() => setRatingKind("bad")}
                  className={`h-16 rounded-2xl text-2xl font-bold border-2 ${ratingKind === "bad" ? "border-destructive bg-destructive/10" : "border-border"}`}
                >
                  {t("chat.rateBadBtn")}
                </button>
              </div>
              {ratingKind === "bad" && (
                <div className="mb-4">
                  <div className="text-xs font-semibold mb-2">{t("chat.badReasonTitle")}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {badReasons.map((r) => (
                      <button key={r} onClick={() => setRatingBadReason(r)} className={`py-2.5 rounded-xl text-xs font-medium border ${ratingBadReason === r ? "bg-destructive/10 border-destructive text-destructive" : "border-border"}`}>{r}</button>
                    ))}
                  </div>
                </div>
              )}
              <textarea value={ratingComment} onChange={(e) => setRatingComment(e.target.value)} placeholder={t("chat.badReasonCommentPlaceholder")} className="w-full bg-accent rounded-xl px-4 py-3 text-sm outline-none resize-none h-20 mb-4" />
              <button onClick={submitReview} disabled={!ratingKind || (ratingKind === "bad" && !ratingBadReason) || submittingReview} className="w-full h-12 bg-primary text-white rounded-xl font-bold disabled:opacity-40">
                {submittingReview ? t("chat.rateSubmitting") : t("chat.rateSubmit")}
              </button>
            </div>
          </div>
        );
      })()}


      {showReportSheet && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowReportSheet(false)}>
          <div className="w-full bg-card rounded-t-3xl p-6 pb-10" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-border rounded-full mx-auto mb-4" />
            <h3 className="text-base font-bold mb-1">{t("chat.reportSheetTitle")}</h3>
            <p className="text-xs text-muted-foreground mb-4">{t("chat.reportSheetHint")}</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {[t("chat.reportR1"), t("chat.reportR2"), t("chat.reportR3"), t("chat.reportR4")].map((r) => (
                <button key={r} onClick={() => setReportReason(r)} className={`py-2.5 rounded-xl text-sm font-medium border ${reportReason === r ? "bg-destructive/10 border-destructive text-destructive" : "border-border"}`}>{r}</button>
              ))}
            </div>
            <textarea value={reportReason} onChange={(e) => setReportReason(e.target.value)} placeholder={t("chat.reportOtherPlaceholder")} className="w-full bg-accent rounded-xl px-4 py-3 text-sm outline-none resize-none h-16 mb-4" />
            <button onClick={reportUser} disabled={!reportReason.trim()} className="w-full h-12 bg-destructive text-white rounded-xl font-bold disabled:opacity-40">{t("chat.reportSubmitBtn")}</button>
          </div>
        </div>
      )}

      {showCompleteSheet && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowCompleteSheet(false)}>
          <div className="w-full bg-card rounded-t-3xl p-6 pb-10" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-border rounded-full mx-auto mb-4" />
            <h3 className="text-base font-bold mb-2">{t("chat.completeSheetTitle")}</h3>
            <p className="text-sm text-muted-foreground mb-6">
              {isBuyer
                ? t("chat.completeDescBuyer")
                : t("chat.completeDescSeller")}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowCompleteSheet(false)} className="flex-1 h-12 border border-border rounded-xl text-sm font-semibold">{t("common.cancel")}</button>
              <button onClick={() => { setShowCompleteSheet(false); completeTransaction(); }} className="flex-1 h-12 bg-success text-white rounded-xl text-sm font-bold">{t("chat.completeConfirmBtn")}</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteSheet && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowDeleteSheet(false)}>
          <div className="w-full bg-card rounded-t-3xl p-6 pb-10" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-border rounded-full mx-auto mb-4" />
            <h3 className="text-base font-bold mb-2">{t("chat.deleteSheetTitle")}</h3>
            <p className="text-sm text-muted-foreground mb-6">{t("chat.deleteSheetDesc")}</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteSheet(false)} className="flex-1 h-12 border border-border rounded-xl text-sm font-semibold">{t("common.back")}</button>
              <button onClick={() => { setShowDeleteSheet(false); deleteConversation(); }} className="flex-1 h-12 bg-destructive text-white rounded-xl text-sm font-bold">{t("chat.deleteConfirm")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Seller: mark delivery confirmed */}
      {showDeliverySheet && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => !uploadingDelivery && setShowDeliverySheet(false)}>
          <div className="w-full bg-card rounded-t-3xl p-6 pb-10" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-border rounded-full mx-auto mb-4" />
            <h3 className="text-base font-bold mb-2">{t("chat.deliverySheetTitle")}</h3>
            <p className="text-sm text-muted-foreground mb-4">{t("chat.deliverySheetDesc")}</p>

            {deliveryPhotoPreview ? (
              <div className="relative mb-4">
                <img src={deliveryPhotoPreview} alt={t("chat.proofAlt")} className="w-full rounded-xl object-cover max-h-64" />
                <button
                  onClick={() => { setDeliveryPhoto(null); setDeliveryPhotoPreview(null); }}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white grid place-items-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="block mb-4 border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:bg-accent">
                <Camera className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                <div className="text-xs text-muted-foreground">{t("chat.uploadProof")}</div>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setDeliveryPhoto(f);
                    setDeliveryPhotoPreview(URL.createObjectURL(f));
                  }}
                />
              </label>
            )}

            <div className="-mt-2 mb-4 text-[11px] leading-relaxed text-orange-500 font-medium">
              {t("chat.proofWarning")}
            </div>


            <div className="flex gap-3">
              <button
                onClick={() => setShowDeliverySheet(false)}
                disabled={uploadingDelivery}
                className="flex-1 h-12 border border-border rounded-xl text-sm font-semibold disabled:opacity-50"
              >{t("common.back")}</button>
              <button
                onClick={confirmDelivery}
                disabled={uploadingDelivery}
                className="flex-1 h-12 bg-primary text-primary-foreground rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {uploadingDelivery ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("chat.processing")}</> : t("chat.confirmDelivered")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Buyer: confirm receipt */}
      {showBuyerConfirmSheet && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => !confirmingBuyer && setShowBuyerConfirmSheet(false)}>
          <div className="w-full bg-card rounded-t-3xl p-6 pb-10" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-border rounded-full mx-auto mb-4" />
            <h3 className="text-base font-bold mb-2">{t("chat.buyerConfirmTitle")}</h3>
            <p className="text-sm text-muted-foreground mb-6">{t("chat.buyerConfirmDesc")}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowBuyerConfirmSheet(false)}
                disabled={confirmingBuyer}
                className="flex-1 h-12 border border-border rounded-xl text-sm font-semibold disabled:opacity-50"
              >{t("common.back")}</button>
              <button
                onClick={() => buyerConfirm(false)}
                disabled={confirmingBuyer}
                className="flex-1 h-12 bg-success text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {confirmingBuyer ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("chat.processing")}</> : t("chat.confirmRelease")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showParkingSheet && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => !uploadingParking && setShowParkingSheet(false)}>
          <div className="w-full bg-card rounded-t-3xl p-6 pb-10" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-border rounded-full mx-auto mb-4" />
            <h3 className="text-base font-bold mb-2">🅿️ 提交泊車確認</h3>
            <p className="text-sm text-muted-foreground mb-4">
              到領展服務處辦理完泊車優惠後，即影確認單或收據截圖上傳。相片將同時發送給買家作驗證。
            </p>
            {parkingPhotoPreview ? (
              <div className="relative mb-4">
                <img src={parkingPhotoPreview} alt="泊車確認" className="w-full rounded-xl object-cover max-h-64" />
                <button
                  onClick={() => { setParkingPhoto(null); setParkingPhotoPreview(null); }}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white grid place-items-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="block mb-4 border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:bg-accent">
                <Camera className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                <div className="text-xs text-muted-foreground">即影泊車確認單</div>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setParkingPhoto(f);
                    setParkingPhotoPreview(URL.createObjectURL(f));
                  }}
                />
              </label>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowParkingSheet(false)}
                disabled={uploadingParking}
                className="flex-1 h-12 border border-border rounded-xl text-sm font-semibold disabled:opacity-50"
              >取消</button>
              <button
                onClick={confirmParking}
                disabled={!parkingPhoto || uploadingParking}
                className="flex-1 h-12 bg-primary text-primary-foreground rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {uploadingParking ? <><Loader2 className="w-4 h-4 animate-spin" /> 上傳中…</> : "確認提交"}
              </button>
            </div>
          </div>
        </div>
      )}

      {lightboxUrl && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="放大圖片" className="max-w-full max-h-full rounded-xl object-contain" />
          <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/60 text-white grid place-items-center" onClick={() => setLightboxUrl(null)}>
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
