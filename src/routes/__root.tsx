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
