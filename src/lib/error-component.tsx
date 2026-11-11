import type { ErrorComponentProps } from "@tanstack/react-router";
import { Home, RefreshCw, TriangleAlert } from "lucide-react";

const FALLBACK_MESSAGE =
  "An unexpected error occurred. Try reloading the page, or go back to the home page.";

/**
 * Never render `error.message` here. This component is used on public routes,
 * and a server error can carry SQL, table names, file paths or customer data.
 * The detail belongs in the server log, not in the visitor's browser.
 */
export function AppErrorComponent({ error, reset }: ErrorComponentProps) {
  if (import.meta.env.DEV && error instanceof Error) {
    console.error(error);
  }

  const handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg px-6 text-center text-fg">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-danger/10">
        <TriangleAlert className="size-8 text-danger" strokeWidth={2} aria-hidden="true" />
      </div>
      <div className="space-y-2">
        <h1 className="font-serif text-3xl">Something went wrong</h1>
        <p className="max-w-md text-sm text-muted">{FALLBACK_MESSAGE}</p>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={reset ?? handleReload}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent/90"
        >
          <RefreshCw className="size-4" />
          Try again
        </button>
        <a
          href="/"
          className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-raised"
        >
          <Home className="size-4" />
          Back to home
        </a>
      </div>
    </main>
  );
}
