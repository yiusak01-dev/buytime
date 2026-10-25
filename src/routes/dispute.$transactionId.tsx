import { createFileRoute, redirect } from "@tanstack/react-router";

// 舊版收據交易爭議（舊「買時間」收據交易版已經停用，舊連結轉去新版）
export const Route = createFileRoute("/dispute/$transactionId")({
  beforeLoad: () => {
    throw redirect({ to: "/me", replace: true });
  },
});
