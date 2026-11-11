import { createFileRoute } from "@tanstack/react-router";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const Route = createFileRoute("/api/version")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const pkgPath = join(process.cwd(), "package.json");
          const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
          return Response.json(
            {
              name: pkg.name,
              version: pkg.version,
              description: pkg.description,
              node: process.version,
              environment: process.env.NODE_ENV || "development",
              timestamp: new Date().toISOString(),
            },
            {
              headers: {
                "cache-control": "public, max-age=60",
                "x-robots-tag": "noindex",
              },
            },
          );
        } catch (error) {
          console.error("[version] failed to read package.json", error);
          return Response.json(
            {
              version: "unknown",
              timestamp: new Date().toISOString(),
            },
            { status: 500, headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
} as any);
