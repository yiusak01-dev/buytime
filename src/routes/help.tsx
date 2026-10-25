import { createFileRoute, redirect } from "@tanstack/react-router";

// 舊版說明頁（舊「買時間」收據交易版已經停用，舊連結轉去新版）
export const Route = createFileRoute("/help")({
  beforeLoad: () => {
    throw redirect({ to: "/me", replace: true });
  },
});
