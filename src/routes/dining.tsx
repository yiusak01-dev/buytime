import { createFileRoute, redirect } from "@tanstack/react-router";

// 舊版類別頁：而家四個場景喺首頁一齊顯示，用篩選分類
export const Route = createFileRoute("/dining")({
  beforeLoad: () => {
    throw redirect({ to: "/", search: { cat: "dining" } });
  },
});
