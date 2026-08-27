import { Link, useRouterState } from "@tanstack/react-router";
import { Home, MessageCircle, Plus, Bell, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useUnreadChats } from "@/hooks/useUnreadChats";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";
import i18n from "@/i18n/config";

type NavItem = { to: string; labelKey: string; icon: typeof Home; prominent?: boolean };
const items: NavItem[] = [
  { to: "/", labelKey: "nav.home", icon: Home },
  { to: "/chats", labelKey: "nav.chats", icon: MessageCircle },
  { to: "/sell", labelKey: "nav.sell", icon: Plus, prominent: true },
  { to: "/announcements", labelKey: "nav.announcements", icon: Bell },
  { to: "/profile", labelKey: "nav.profile", icon: User },
];

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hasUnread = useUnreadChats();
  const hasUnreadNotifs = useUnreadNotifications();
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
            const isNotifs = it.to === "/announcements";
            const showDot = (isChats && hasUnread) || (isNotifs && hasUnreadNotifs);

            if (it.prominent) {
              return (
                <Link key={it.to} to={it.to as string} className="flex items-start justify-center pt-1">
                  <div className="-mt-6 w-14 h-14 rounded-full gradient-primary text-primary-foreground grid place-items-center shadow-lg shadow-primary/30 ring-4 ring-background">
                    <Icon className="w-6 h-6" strokeWidth={2.5} />
                  </div>
                </Link>
              );
            }

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
