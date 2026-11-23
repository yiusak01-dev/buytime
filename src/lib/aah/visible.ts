import { useSyncExternalStore } from "react";

/** 個畫面而家係咪睇得到（app 喺前面） */
export function useDocVisible() {
  return useSyncExternalStore(
    (fn) => {
      document.addEventListener("visibilitychange", fn);
      return () => document.removeEventListener("visibilitychange", fn);
    },
    () => document.visibilityState === "visible",
    () => true,
  );
}
