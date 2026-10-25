import { createFileRoute, redirect } from "@tanstack/react-router";

// 舊版賣收據：而家用「出 post」（舊「買時間」收據交易版已經停用，舊連結轉去新版）
export const Route = createFileRoute("/sell")({
  beforeLoad: () => {
    throw redirect({ to: "/post/new", replace: true });
  },
});
