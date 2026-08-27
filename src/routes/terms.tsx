import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "服務條款 · 買時間" },
      { name: "description", content: "買時間服務條款 v1.0" },
      { property: "og:title", content: "服務條款 · 買時間" },
      { property: "og:description", content: "買時間服務條款 v1.0" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

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
        <div>
          <h1 className="text-xl font-bold leading-tight">{t("terms.title")}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t("terms.version")}</p>
        </div>
      </header>

      <main className="px-4 py-5 space-y-4">
        {(["s1", "s2"] as const).map((key) => (
          <section key={key} className="bg-card rounded-2xl p-4 shadow-[var(--shadow-card)]">
            <h2 className="text-sm font-bold text-foreground mb-2">{t(`terms.${key}.title`)}</h2>
            <div className="text-sm text-muted-foreground leading-relaxed">{t(`terms.${key}.body`)}</div>
          </section>
        ))}

        <section className="bg-card rounded-2xl p-4 shadow-[var(--shadow-card)]">
          <h2 className="text-sm font-bold text-foreground mb-2">{t("terms.s3.title")}</h2>
          <div className="text-sm text-muted-foreground leading-relaxed space-y-2">
            <p>{t("terms.s3.p1")}</p>
            <p>{t("terms.s3.p2")}</p>
            <p>{t("terms.s3.p3")}</p>
          </div>
        </section>

        {(["s4", "s5", "s6", "s7", "s8"] as const).map((key) => (
          <section key={key} className="bg-card rounded-2xl p-4 shadow-[var(--shadow-card)]">
            <h2 className="text-sm font-bold text-foreground mb-2">{t(`terms.${key}.title`)}</h2>
            <div className="text-sm text-muted-foreground leading-relaxed">{t(`terms.${key}.body`)}</div>
          </section>
        ))}

        <p className="text-center text-[11px] text-muted-foreground pt-2">{t("terms.footer")}</p>
      </main>
    </div>
  );
}
