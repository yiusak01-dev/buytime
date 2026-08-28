import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { createRouter } from "./router";
import { supabaseAuthMiddleware } from "./integrations/supabase/auth-middleware";
import { errorMiddleware } from "./lib/error-capture";

export const startInstance = createStartHandler({
  createRouter,
  middleware: [supabaseAuthMiddleware, errorMiddleware],
})(defaultStreamHandler);
