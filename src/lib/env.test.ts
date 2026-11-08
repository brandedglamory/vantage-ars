import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateEnv } from "./env.ts";

describe("environment validation", () => {
  it("blocks autonomous mode without the auth secret", () => {
    const result = validateEnv({
      BETTER_AUTH_URL: "https://example.com",
      FOUNDER_EMAIL: "founder@example.com",
      DATABASE_URL: "postgres://example.db",
      BETTER_AUTH_SECRET: "",
    });

    assert.ok(result.blocked.some((item) => item.includes("BETTER_AUTH_SECRET")));
  });

  it("does not require a cron secret: the office keeps its own clock", () => {
    const result = validateEnv({
      AUTONOMY: "on",
      BETTER_AUTH_URL: "https://example.com",
      FOUNDER_EMAIL: "founder@example.com",
      DATABASE_URL: "postgres://example.db",
      BETTER_AUTH_SECRET: "12345678901234567890123456789012",
      CRON_SECRET: "",
    });

    assert.deepEqual(result.blocked, []);
  });

  it("does not block when autonomy is deliberately off", () => {
    const result = validateEnv({
      AUTONOMY: "off",
      BETTER_AUTH_URL: "https://example.com",
      FOUNDER_EMAIL: "founder@example.com",
      DATABASE_URL: "postgres://example.db",
    });

    assert.deepEqual(result.blocked, []);
  });

  it("treats an unset AUTONOMY as enabled", () => {
    const result = validateEnv({
      BETTER_AUTH_URL: "https://example.com",
      FOUNDER_EMAIL: "founder@example.com",
      DATABASE_URL: "postgres://example.db",
      BETTER_AUTH_SECRET: "",
    });

    assert.ok(result.blocked.some((item) => item.includes("BETTER_AUTH_SECRET")));
  });
});
