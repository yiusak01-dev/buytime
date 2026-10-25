import { createFileRoute, redirect } from "@tanstack/react-router";

// 舊版搜尋：而家首頁直接睇附近着數（舊「買時間」收據交易版已經停用，舊連結轉去新版）
export const Route = createFileRoute("/search")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
