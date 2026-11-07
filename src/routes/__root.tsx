import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect } from "react";

import "@/i18n/config";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { AahRuntime } from "@/components/aah/AahRuntime";
import { SplashScreen } from "@/components/aah/BrandMark";
import { initNative } from "@/lib/native";

/** 新版上咗線，舊頁面搵唔到舊檔案：自動重新載入一次（30 秒內唔再重複，免得死循環） */
function reloadForNewVersion(): boolean {
  try {
    const key = "aah:reloadedAt";
    const last = Number(window.sessionStorage.getItem(key) ?? 0);
    if (Date.now() - last < 30_000) return false;
    window.sessionStorage.setItem(key, String(Date.now()));
  } catch {
    /* 私隱模式：照樣重新載入 */
  }
  window.location.reload();
  return true;
}
const STALE_CHUNK = /dynamically imported module|Importing a module script failed|error loading dynamically|Failed to fetch dynamically|MIME type/i;

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center space-y-3">
        <div className="text-5xl">🤔</div>
        <h1 className="text-xl font-bold text-foreground">搵唔到呢一頁</h1>
        <p className="text-sm text-muted-foreground">條連結可能已經過咗期，或者打錯咗。</p>
        <Link to="/" className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#1a1a1a] px-6 text-sm font-bold text-white">
          返去首頁
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    if (STALE_CHUNK.test(error instanceof Error ? error.message : String(error)) && reloadForNewVersion()) return;
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center space-y-3">
        <div className="text-5xl">😵</div>
        <h1 className="text-xl font-bold text-foreground">呢一頁載入唔到</h1>
        <p className="text-sm text-muted-foreground">可能係網絡唔穩定。試吓再載入，或者返去首頁。</p>
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#1a1a1a] px-6 text-sm font-bold text-white"
          >
            再試一次
          </button>
          <a href="/" className="inline-flex h-11 items-center justify-center rounded-2xl border border-border bg-card px-6 text-sm font-semibold">
            返去首頁
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  // 新版上咗線：舊頁面載入唔到檔案就自動重新載入
  useEffect(() => {
    const onPreloadError = (e: Event) => {
      if (reloadForNewVersion()) e.preventDefault();
    };
    window.addEventListener("vite:preloadError", onPreloadError);
    return () => window.removeEventListener("vite:preloadError", onPreloadError);
  }, []);

  // 原生 app（iPhone／Android）：狀態列、返回掣、由連結打開 app
  useEffect(() => {
    void initNative((path) => router.history.push(path));
    // 只限雲端打包測試：開 app 直接去指定一版影相（正式版冇設定，唔會行）
    const ciRoute = import.meta.env.VITE_CI_ROUTE as string | undefined;
    if (ciRoute) router.history.replace(ciRoute);
  }, [router]);

  // Email 連結落咗去其他頁（例如重新導向唔喺許可清單，跌返落首頁）：轉去啱嘅確認頁
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const path = window.location.pathname;
    if (!q.get("token_hash") || path === "/confirm" || path === "/reset-password") return;
    const target = q.get("type") === "recovery" ? "/reset-password" : "/confirm";
    window.location.replace(`${target}${window.location.search}`);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <AahRuntime />
      <SplashScreen />
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
