import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "私隱政策 · 買時間" },
      { name: "description", content: "買時間私隱政策 Beta 1.0" },
    ],
  }),
  component: PrivacyPage,
});

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  { title: "1. 收集的資料", body: "本平台收集以下資料：登記時提供的電郵地址及用戶名稱、上架收據的商場、金額及有效期資料、交易紀錄（買賣雙方配對資料）。" },
  { title: "2. 使用目的", body: "所收集資料僅用於：提供配對服務、聯絡用戶處理交易事宜、改善平台服務。" },
  { title: "3. 資料保密", body: "本平台不會將你的個人資料出售、出租或披露予第三方，除非法律要求。" },
  { title: "4. 資料儲存", body: "用戶資料儲存於安全的雲端伺服器（Supabase），受業界標準加密保護。" },
  { title: "5. 查閱及更正", body: "你有權查閱及更正本人資料。如需查閱，請電郵至 hello@buytime.hk。" },
  { title: "6. Cookie", body: "本平台使用必要的 Cookie 維持登入狀態，不作任何追蹤或廣告用途。" },
  { title: "7. 聯絡我們", body: "如對私隱政策有任何疑問，請電郵：hello@buytime.hk" },
];

function PrivacyPage() {
  const navigate = useNavigate();
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
        <div>
          <h1 className="text-xl font-bold leading-tight">私隱政策</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Beta 1.0 · 生效日期：2026年7月</p>
        </div>
      </header>

      <main className="px-4 py-5 space-y-4">
        {SECTIONS.map((s) => (
          <section key={s.title} className="bg-card rounded-2xl p-4 shadow-[var(--shadow-card)]">
            <h2 className="text-sm font-bold text-foreground mb-2">{s.title}</h2>
            <div className="text-sm text-muted-foreground leading-relaxed">{s.body}</div>
          </section>
        ))}
        <p className="text-center text-[11px] text-muted-foreground pt-2">
          依據《個人資料（私隱）條例》（香港法例第486章）
        </p>
      </main>
    </div>
  );
}
