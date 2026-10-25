import { createFileRoute, redirect } from "@tanstack/react-router";

// 舊版對話列表：而家對話喺「我的配對」（舊「買時間」收據交易版已經停用，舊連結轉去新版）
export const Route = createFileRoute("/chats")({
  beforeLoad: () => {
    throw redirect({ to: "/me", replace: true });
  },
});
