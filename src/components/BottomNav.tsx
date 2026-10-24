import { Link, useRouterState } from "@tanstack/react-router";
import { Search, Plus, MessageCircle } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useAahState } from "@/lib/aah/store";

/** 三個 tab：睇着數／出 post／我的配對 */
export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { matches, user } = useAahState();
  const hasActive = useMemo(
    () => matches.some((m) => m.status === "active" && m.participants.some((p) => p.userId === user.id)),
    [matches, user.id],
  );

  const homeActive = pathname === "/" || pathname.startsWith("/post/") && pathname !== "/post/new";
  const meActive = pathname.startsWith("/me") || pathname.startsWith("/match/");

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 pointer-events-none">
      <div className="relative max-w-lg mx-auto pointer-events-auto">
        <div className="relative border-t border-border bg-card/95 backdrop-blur-md h-16 grid grid-cols-3 pb-[env(safe-area-inset-bottom)]">
          <Link to="/" className={cn("flex flex-col items-center justify-center gap-0.5 text-[11px]", homeActive ? "text-[#1a1a1a] dark:text-white font-bold" : "text-muted-foreground")}>
            <Search className="w-5 h-5" strokeWidth={homeActive ? 2.6 : 2} />
            睇着數
          </Link>
          <Link to="/post/new" className="flex flex-col items-center justify-start -mt-5 gap-1 text-[11px] font-semibold text-foreground">
            <span className="w-14 h-14 rounded-full bg-[#F5C518] text-[#1a1a1a] grid place-items-center shadow-lg ring-4 ring-background">
              <Plus className="w-7 h-7" strokeWidth={2.6} />
            </span>
            出 post
          </Link>
          <Link to="/me" className={cn("flex flex-col items-center justify-center gap-0.5 text-[11px]", meActive ? "text-[#1a1a1a] dark:text-white font-bold" : "text-muted-foreground")}>
            <span className="relative">
              <MessageCircle className="w-5 h-5" strokeWidth={meActive ? 2.6 : 2} />
              {hasActive && <span className="absolute -top-0.5 -right-1 w-2.5 h-2.5 rounded-full bg-[#E8642A] ring-2 ring-card" />}
            </span>
            我的配對
          </Link>
        </div>
      </div>
    </nav>
  );
}
