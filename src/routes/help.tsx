import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "幫助中心 · 買時間" },
      { name: "description", content: "買時間常見問題與使用說明" },
      { property: "og:title", content: "幫助中心 · 買時間" },
      { property: "og:description", content: "買時間常見問題與使用說明" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HelpPage,
});

function HelpPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const allGroupKeys = ["about", "sell", "buy", "safety", "disputes"] as const;
  const groups = allGroupKeys
    .map((key) => {
      const items: { q: string; a: string }[] = [];
      for (let i = 1; i <= 6; i++) {
        const q = t(`help.groups.${key}.q${i}`);
        const a = t(`help.groups.${key}.a${i}`);
        if (!q || q === `help.groups.${key}.q${i}`) break;
        items.push({ q, a });
      }
      return { key, title: t(`help.groups.${key}.title`), items };
    })
    .filter((g) => g.items.length > 0);

  return (
    <div className="app-shell pb-16">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md px-4 pt-4 pb-3 border-b border-border/60 flex items-center gap-2">
        <button
          onClick={() => navigate({ to: "/profile" })}
          className="w-9 h-9 -ml-2 grid place-items-center rounded-full hover:bg-accent"
          aria-label={t("common.back")}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold leading-tight">{t("help.title")}</h1>
      </header>

      <main className="px-4 py-5 space-y-5">
        {groups.map((g) => (
          <section key={g.key}>
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 px-1">{g.title}</h2>
            <div className="bg-card rounded-2xl divide-y divide-border shadow-[var(--shadow-card)] overflow-hidden">
              {g.items.map((it, i) => (
                <div key={i} className="p-4">
                  <div className="text-sm font-semibold text-foreground mb-1.5">Q：{it.q}</div>
                  <div className="text-sm text-muted-foreground leading-relaxed">A：{it.a}</div>
                </div>
              ))}
            </div>
          </section>
        ))}
        <p className="text-center text-[11px] text-muted-foreground pt-2">{t("help.contact")}</p>
      </main>
    </div>
  );
}
