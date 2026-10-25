import { useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

export type LegalSection = { title: string; body: ReactNode };

/** 服務條款／私隱政策共用版面 */
export function LegalPage({ title, version, intro, sections }: { title: string; version: string; intro?: ReactNode; sections: LegalSection[] }) {
  const router = useRouter();
  const back = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.history.back();
    else router.navigate({ to: "/me" });
  };
  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md px-4 pt-4 pb-3 border-b border-border/60 flex items-center gap-2">
        <button onClick={back} className="w-9 h-9 -ml-2 grid place-items-center rounded-full hover:bg-accent" aria-label="返回">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold leading-tight">{title}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{version}</p>
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 py-5 space-y-4">
        {intro && <div className="text-sm text-muted-foreground leading-relaxed">{intro}</div>}
        {sections.map((s) => (
          <section key={s.title} className="bg-card rounded-2xl p-4 shadow-[var(--shadow-card)]">
            <h2 className="text-sm font-bold text-foreground mb-2">{s.title}</h2>
            <div className="text-sm text-muted-foreground leading-relaxed space-y-2">{s.body}</div>
          </section>
        ))}
        <p className="text-center text-[11px] text-muted-foreground pt-2">
          啱啱好 BuyTime · 有問題請電郵 <a href="mailto:support@buytime.hk" className="underline">support@buytime.hk</a>
        </p>
      </main>
    </div>
  );
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}
