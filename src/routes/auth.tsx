import { createFileRoute, redirect } from "@tanstack/react-router";

// 舊版登入頁：而家喺「我的配對」登入／註冊（舊「買時間」收據交易版已經停用，舊連結轉去新版）
export const Route = createFileRoute("/auth")({
  beforeLoad: () => {
    throw redirect({ to: "/me", replace: true });
  },
});
