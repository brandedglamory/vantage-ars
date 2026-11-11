import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/ai/models")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const res = await fetch("https://opencode.ai/zen/v1/models", {
            signal: AbortSignal.timeout(8_000),
            headers: { accept: "application/json" },
          });
          if (!res.ok) {
            return Response.json({ ok: false, error: `upstream ${res.status}` }, { status: 502 });
          }
          const data = (await res.json()) as { data?: { id: string; name?: string }[] };
          const free = (data.data ?? [])
            .filter((m) => /free/i.test(m.id))
            .map((m) => ({ id: m.id, name: m.name ?? m.id }));
          return Response.json(
            { ok: true, count: free.length, models: free },
            { headers: { "cache-control": "public, max-age=300", "x-robots-tag": "noindex" } },
          );
        } catch (error) {
          return Response.json(
            { ok: false, error: error instanceof Error ? error.message : "unknown" },
            { status: 502, headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
} as any);
