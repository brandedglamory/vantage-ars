/**
 * The autonomy switch.
 *
 * The office is autonomous unless it is deliberately disarmed: only an explicit
 * `AUTONOMY=off` stops unattended work. `on`, unset, empty or any other value
 * leaves the floor running itself, because a project that has to be switched on
 * by hand is not autonomous. The founder keeps the one switch that stops every
 * unattended run.
 *
 * Pure module: callers pass the value they read, so it is safe in client code.
 */
/** Values that deliberately disarm the office. Anything else leaves it on. */
export const AUTONOMY_DISARMED = ["off", "false", "0", "no", "paused"] as const;

export function autonomyEnabled(value: string | null | undefined): boolean {
  const normalized = value?.trim().toLowerCase() ?? "";
  return !(AUTONOMY_DISARMED as readonly string[]).includes(normalized);
}

/** Read the switch from the live server environment. Server-only. */
export function autonomyFromEnv(): boolean {
  return autonomyEnabled(typeof process === "undefined" ? undefined : process.env.AUTONOMY);
}
