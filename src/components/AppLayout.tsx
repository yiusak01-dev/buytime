import { BottomNav } from "./BottomNav";
import type { ReactNode } from "react";

export function AppLayout({ children, title, subtitle, headerRight }: { children: ReactNode; title?: string; subtitle?: string; headerRight?: ReactNode }) {
  return (
    <div className="app-shell pb-24">
      {title && (
        <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md px-4 pt-4 pb-3 border-b border-border/60">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground leading-tight">{title}</h1>
              {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
            </div>
            {headerRight && <div>{headerRight}</div>}
          </div>
        </header>
      )}
      <main>{children}</main>
      <BottomNav />
    </div>
  );
}
