import { createFileRoute, redirect } from "@tanstack/react-router";

// 舊版公告（舊「買時間」收據交易版已經停用，舊連結轉去新版）
export const Route = createFileRoute("/announcements")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
