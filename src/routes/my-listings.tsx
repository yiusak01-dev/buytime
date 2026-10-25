import { createFileRoute, redirect } from "@tanstack/react-router";

// 舊版我的收據（舊「買時間」收據交易版已經停用，舊連結轉去新版）
export const Route = createFileRoute("/my-listings")({
  beforeLoad: () => {
    throw redirect({ to: "/me", replace: true });
  },
});
