import { createFileRoute } from "@tanstack/react-router";
import { resolveModelTarget } from "@/lib/office/ai-provider";

/**
 * Public AI-staff readiness probe. Reports WHICH provider would answer and
 * whether each credential is present — never values, never the endpoint URL.
 * Used to verify Cloudflare Workers AI wiring after setting host env vars.
 */
export const Route = createFileRoute("/api/ai/status")({
  server: {
    handlers: {
      GET: async () => {
        const target = resolveModelTarget(process.env);
        return Response.json({
          ok: true,
          provider: target?.provider ?? "none",
          model: target?.model ?? null,
          workersAi: {
            accountId: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID?.trim()),
            apiToken: Boolean(process.env.CLOUDFLARE_API_TOKEN?.trim()),
          },
          xai: Boolean(process.env.XAI_API_KEY?.trim()),
          opencodeZen: true,
          note: target
            ? "AI staff can call the reasoning model."
            : "AI staff will report unavailable until a provider is configured.",
        });
      },
    },
  },
} as any);
