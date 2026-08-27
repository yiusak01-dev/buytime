import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { requireSignedIn } from "@/lib/auth-guard";

export const Route = createFileRoute("/notifications")({
  beforeLoad: requireSignedIn,
  head: () => ({
    meta: [
      { title: "通知設定 · 買時間" },
      { name: "description", content: "管理買時間的新訊息及交易狀態通知" },
      { property: "og:title", content: "通知設定 · 買時間" },
      { property: "og:description", content: "管理買時間的新訊息及交易狀態通知" },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const navigate = useNavigate();
  const [newMessage, setNewMessage] = useState(true);
  const [txUpdates, setTxUpdates] = useState(true);

  return (
    <div className="app-shell pb-16">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md px-4 pt-4 pb-3 border-b border-border/60 flex items-center gap-2">
        <button
          onClick={() => navigate({ to: "/profile" })}
          className="w-9 h-9 -ml-2 grid place-items-center rounded-full hover:bg-accent"
          aria-label="返回"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold leading-tight">通知設定</h1>
      </header>

      <main className="px-4 py-5 space-y-3">
        <div className="bg-card rounded-2xl divide-y divide-border shadow-[var(--shadow-card)] overflow-hidden">
          <ToggleRow label="新訊息通知" checked={newMessage} onChange={setNewMessage} />
          <ToggleRow label="交易狀態更新" checked={txUpdates} onChange={setTxUpdates} />
        </div>
        <p className="text-center text-[11px] text-muted-foreground pt-1">
          Beta測試階段，推送通知功能即將推出
        </p>
      </main>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-accent/40 text-left"
    >
      <span className="flex-1 text-sm font-medium">{label}</span>
      <span
        className={`w-11 h-6 rounded-full p-0.5 transition-colors ${checked ? "bg-primary" : "bg-muted"}`}
      >
        <span
          className={`block w-5 h-5 rounded-full bg-background shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`}
        />
      </span>
    </button>
  );
}
