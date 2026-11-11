import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PublicChat } from "@/components/chat/live-chat";
import { PublicFrame } from "@/components/public/site-frame";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/react";
import { useSiteSignals } from "@/lib/site/signals";
import appCss from "../styles.css?url";
import { validateEnv } from "@/lib/env";

// Validate critical environment variables once when the server module loads.
// Guarded so it never runs in the browser. Autonomy-enabled deployments fail
// fast on missing cron/auth configuration so the office never starts half-wired.
if (typeof window === "undefined") {
  const report = validateEnv();
  if (report.blocked.length > 0) {
    throw new Error(`[vantage-ars] ${report.blocked.join(" ")}`);
  }
}

const APP_NAME = "Vantage-ARS";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content:
          "Worldwide remote VoIP, networking and IT infrastructure support from Vantage-ARS, with clear ZAR pricing.",
      },
      { name: "theme-color", content: "#050a12" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-180.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      // Fonts are fetched in CORS mode; without this the preconnected socket is
      // not reused for the actual font request.
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=Instrument+Serif:ital@0;1&family=Space+Grotesk:wght@500;600;700&display=swap",
      },
    ],
  }),
  notFoundComponent: NotFound,
  component: () => (
    <html lang="en-ZA" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-bg text-fg">
        <PreviewHostBridge />
        <AuthProvider>
          <TooltipProvider delayDuration={200}>
            <SiteSignals />
            <Outlet />
            <PublicChat />
          </TooltipProvider>
        </AuthProvider>
        <Toaster theme="light" position="bottom-right" />
        <Analytics />
        <Scripts />
      </body>
    </html>
  ),
});

/**
 * Report the page the visitor is actually reading, so SIGNAL has real traffic
 * data. Mounted at the root so single-page navigations count too, and it only
 * fires for public pages — the office never reports itself.
 */
function SiteSignals() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  useSiteSignals(pathname);
  return null;
}

function NotFound() {
  return (
    <PublicFrame>
      <section className="py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">404 - Missing page</p>
          <h1 className="mt-4 font-serif text-4xl tracking-[-0.03em] sm:text-5xl">
            That page is not on this site.
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm text-muted">
            The services, the service desk, the service finder, and the published rates are still here. Let us help you find what you need.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/"
              className="inline-flex h-11 items-center rounded-md bg-accent px-6 text-sm font-medium text-accent-fg transition-colors hover:bg-accent/90"
            >
              Back to home
            </Link>
            <Link
              to="/services"
              className="inline-flex h-11 items-center rounded-md border border-border px-6 text-sm transition-colors hover:bg-raised"
            >
              View services
            </Link>
            <Link
              to="/find"
              className="inline-flex h-11 items-center rounded-md border border-border px-6 text-sm transition-colors hover:bg-raised"
            >
              Find a service
            </Link>
            <Link
              to="/rates"
              className="inline-flex h-11 items-center rounded-md border border-border px-6 text-sm transition-colors hover:bg-raised"
            >
              View rates
            </Link>
          </div>
        </div>
      </section>
    </PublicFrame>
  );
}
