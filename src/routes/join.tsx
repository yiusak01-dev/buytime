import { createFileRoute, redirect } from "@tanstack/react-router";

/** 「夾」頁已經併入「搵」：舊連結（推送、分享）轉去「搵」嘅夾單類別 */
export const Route = createFileRoute("/join")({
  beforeLoad: () => {
    throw redirect({ to: "/", search: { cat: "groupbuy" }, replace: true });
  },
});
