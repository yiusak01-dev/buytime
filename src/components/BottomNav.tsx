import { Link, useRouterState } from "@tanstack/react-router";
import { Home, MessageCircle, ParkingCircle, Utensils, Ticket, ShoppingBag, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useUnreadChats } from "@/hooks/useUnreadChats";
import i18n from "@/i18n/config";

type NavItem = { to: string; labelKey: string; icon: typeof Home };
const items: NavItem[] = [
  { to: "/", labelKey: "nav.home", icon: Home },
  { to: "/parking", labelKey: "nav.parking", icon: ParkingCircle },
  { to: "/dining", labelKey: "nav.dining", icon: Utensils },
  { to: "/offers", labelKey: "nav.offers", icon: Ticket },
  { to: "/group-buy", labelKey: "nav.groupBuy", icon: ShoppingBag },
];

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hasUnread = useUnreadChats();
  const { t } = useTranslation();

  useEffect(() => {
    const saved = localStorage.getItem("lang");
    if (saved && saved !== i18n.language) i18n.changeLanguage(saved);
  }, []);

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 pointer-events-none">
      <div className="relative max-w-lg mx-auto pointer-events-auto">
        <div className="relative border-t border-border bg-card/95 backdrop-blur-md h-16 grid grid-cols-5">
          {items.map((it) => {
            const active = it.to === "/" ? pathname === "/" : pathname.startsWith(it.to);
            const Icon = it.icon;
            const isChats = it.to === "/chats";
            const showDot = isChats && hasUnread;

            return (
              <Link key={it.to} to={it.to as string} className={cn(
                "flex flex-col items-center justify-center gap-0.5 text-[11px] transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}>
                <div className="relative">
                  <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
                  {showDot && !active && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-destructive" />
                  )}
                </div>
                <span className={active ? "font-semibold" : ""}>{t(it.labelKey)}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
