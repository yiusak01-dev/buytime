import { Link, useRouterState } from "@tanstack/react-router";
import { Search, Plus, Users, UserRound } from "lucide-react";
import { useMemo } from "react";
import { useAahState } from "@/lib/aah/store";
import { MUTED, VERBS } from "@/lib/aah/theme";

/** 唔係搵／放／夾三頁時用（例如「我的」）：同頂部三個分頁一樣，加「我的」 */
export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { matches, user } = useAahState();
  const hasActive = useMemo(
    () =>
      matches.some(
        (m) => m.status === "active" && m.participants.some((p) => p.userId === user.id),
      ),
    [matches, user.id],
  );

  const items = [
    {
      to: "/" as const,
      label: VERBS.find.word,
      Icon: Search,
      on: pathname === "/",
      color: VERBS.find.text,
    },
    {
      to: "/give" as const,
      label: VERBS.give.word,
      Icon: Plus,
      on: pathname === "/give",
      color: VERBS.give.text,
    },
    {
      to: "/join" as const,
      label: VERBS.join.word,
      Icon: Users,
      on: pathname === "/join",
      color: VERBS.join.text,
    },
    {
      to: "/me" as const,
      label: "我的",
      Icon: UserRound,
      on: pathname.startsWith("/me") || pathname.startsWith("/match/"),
      color: "#2B2433",
    },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 pointer-events-none">
      <div className="relative max-w-lg mx-auto pointer-events-auto">
        <div className="relative border-t border-border bg-card/95 backdrop-blur-md h-16 grid grid-cols-4 pb-[env(safe-area-inset-bottom)]">
          {items.map(({ to, label, Icon, on, color }) => (
            <Link
              key={to}
              to={to}
              aria-current={on ? "page" : undefined}
              className="flex flex-col items-center justify-center gap-0.5 text-[12px] font-bold"
              style={{ color: on ? color : MUTED }}
            >
              <span className="relative">
                <Icon className="w-5 h-5" strokeWidth={on ? 2.6 : 2} />
                {to === "/me" && hasActive && (
                  <span className="absolute -top-0.5 -right-1 w-2.5 h-2.5 rounded-full bg-[#9A3B0E] ring-2 ring-card" />
                )}
              </span>
              {label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
