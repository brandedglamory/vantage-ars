import { WatchtowerMark } from "@/components/brand/mark";
import { LiveField } from "@/components/public/live-field";
import { SignalBars } from "@/components/public/motion-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { authClient, GROK_PROVIDERS, signOut, signIn } from "@/lib/auth/client";
import { getSignInOptions, type SignInOptions } from "@/lib/auth/sign-in-options";
import type { AppUser } from "@/lib/auth/use-current-user";
import { passwordProblem as checkPassword } from "@/lib/auth/founder-password";
import { COMPANY } from "@/lib/office/company";

type PrivateDoorProps = {
  user?: AppUser | null;
};

/** Pull a human-readable message out of whatever Better Auth returned. */
function messageOf(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && "message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return fallback;
}

/**
 * Better Auth resolves to `{ data, error }` on the happy path but may reject or
 * return a bare `APIError` depending on the call. Read the failure out of any of
 * those shapes rather than trusting one overload's type.
 */
function authFailure(result: unknown): unknown {
  if (result instanceof Error) return result;
  if (result && typeof result === "object" && "error" in result) {
    const error = (result as { error: unknown }).error;
    if (error) return error;
  }
  return null;
}

export function PrivateDoor({ user }: PrivateDoorProps) {
  const [options, setOptions] = useState<SignInOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [setupMode, setSetupMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [founderToken, setFounderToken] = useState("");

  useEffect(() => {
    let cancelled = false;
    getSignInOptions()
      .then((result) => {
        if (!cancelled) {
          setOptions(result);
          setLoading(false);
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Unable to load sign-in options.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      if (setupMode) {
        if (options?.setupTokenRequired && !founderToken.trim()) {
          throw new Error("Founder setup token is required.");
        }
        const emailProblem = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
        if (!emailProblem) throw new Error("Enter the founder email address.");
        const passwordProblem = checkPassword(password);
        if (passwordProblem) throw new Error(passwordProblem);
        const result = await authClient.signUp.email({
          email: email.trim().toLowerCase(),
          password,
          name: name.trim() || "Founder",
          fetchOptions: {
            headers: founderToken.trim()
              ? { "x-founder-setup-token": founderToken.trim() }
              : ({} as Record<string, string>),
          } as any,
        });
        const failure = authFailure(result);
        if (failure) throw new Error(messageOf(failure, "Founder account setup failed."));
      } else {
        const result = await authClient.signIn.email({
          email: email.trim().toLowerCase(),
          password,
        });
        const failure = authFailure(result);
        if (failure) throw new Error(messageOf(failure, "Sign-in failed."));
      }
      // A full navigation re-reads the server session cookie, which is the only
      // authority on founder access. Client state is a hint, never a grant.
      window.location.href = "/office";
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Authentication failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOAuth(providerId: string) {
    setError("");
    setSubmitting(true);
    try {
      // Use the exported signIn helper which handles preview popups and redirects.
      await signIn(providerId, { callbackURL: "/office" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "OAuth sign-in failed.");
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    setSubmitting(true);
    try {
      await signOut();
      window.location.href = "/";
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-bg text-fg">
        <LiveField />
        <div className="relative z-10 flex items-center gap-3 text-xs font-mono uppercase tracking-[0.22em] text-muted">
          <span className="live-dot" />
          Initialising private operations
        </div>
      </div>
    );
  }

  if (user) {
    // The server withheld the snapshot, so this browser's session is not the
    // founder session. Say so plainly and offer the one action that fixes it.
    // Never auto-navigate: that is what turns this into a reload loop.
    const devFallback = user.isDevFallback;
    return (
      <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-bg text-fg">
        <LiveField />
        <div className="relative z-10 w-full max-w-md px-6">
          <div className="glass panel p-8">
            <div className="mb-8 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <WatchtowerMark className="h-8 w-8" />
                <div>
                  <div className="font-mono text-xs font-semibold tracking-[0.18em]">
                    VANTAGE-ARS
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                    Private operations
                  </div>
                </div>
              </div>
              <span className="live-dot" />
            </div>

            <h1 className="font-serif text-3xl tracking-tight">
              {devFallback ? "The office is sealed." : "Session not recognised."}
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted">
              {devFallback
                ? 'Auth is disabled in this environment, so the server never issues a founder session. Sign in needs VITE_AUTH_ENABLED unset (or "true") and a configured founder account.'
                : `This browser holds a session for ${user.primaryEmail ?? "an account"}, but the server did not accept it as the founder of ${COMPANY.legalName}. Sign out and sign in again with the founder address.`}
            </p>

            <div className="mt-8 flex gap-3">
              <Link to="/" className="cta-ghost flex-1 justify-center">
                Public site
              </Link>
              {devFallback ? null : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={submitting}
                  onClick={async () => {
                    await handleSignOut();
                    window.location.href = "/office";
                  }}
                >
                  Sign out and retry
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Gate on what the SERVER says is configured. The provider list is a static
  // catalogue; rendering it unconditionally showed Google/X buttons that could
  // only fail, even with GROK_OAUTH=off.
  const providers = options?.oauth ? (GROK_PROVIDERS ?? []) : [];

  return (
    <div className="site relative min-h-dvh overflow-hidden bg-bg text-fg">
      <LiveField />
      <div className="relative z-10 flex min-h-dvh flex-col">
        <div className="border-b border-border/70 bg-bg/70 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 lg:px-8">
            <div className="flex items-center gap-3">
              <span className="live-dot" />
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
                VANTAGE-ARS · PRIVATE OPERATIONS
              </span>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
              Founder access
            </span>
          </div>
        </div>

        <header className="border-b border-border/60 bg-bg/60 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-8">
            <div className="flex items-center gap-4">
              <WatchtowerMark className="h-10 w-10" />
              <div>
                <div className="font-mono text-sm font-semibold tracking-[0.22em]">VANTAGE-ARS</div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
                  Network operations desk
                </div>
              </div>
            </div>
            <Link to="/" className="cta-ghost hidden sm:inline-flex">
              Public site
            </Link>
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center px-5 py-12 lg:px-8">
          <div className="w-full max-w-lg">
            <div className="mb-6 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
              <span>00 · Restricted</span>
              <span>vantage-ars.co.za / office</span>
            </div>

            <section className="glass panel overflow-hidden">
              <div className="border-b border-border/60 p-7 sm:p-9">
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <div className="mb-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
                      <span className="live-dot" />
                      Private operations
                    </div>
                    <h1 className="font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
                      {setupMode ? "Set up the founder account." : "Command centre access."}
                    </h1>
                    <p className="mt-4 max-w-md text-sm leading-6 text-muted">
                      {setupMode
                        ? "Create the primary founder identity for the Vantage-ARS operations desk. The office bootstraps itself; this is the one account it cannot create for you."
                        : "Authenticated access is required before entering the private operations environment."}
                    </p>
                  </div>
                  <SignalBars className="hidden h-10 w-10 shrink-0 text-accent sm:block" />
                </div>
              </div>

              <div className="p-7 sm:p-9">
                {error ? (
                  <div
                    role="alert"
                    className="mb-6 border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300"
                  >
                    {error}
                  </div>
                ) : null}

                <form onSubmit={handleEmailSubmit} className="space-y-5">
                  {setupMode ? (
                    <div className="space-y-2">
                      <Label htmlFor="name">Founder name</Label>
                      <Input
                        id="name"
                        name="name"
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        disabled={submitting}
                        placeholder="Founder"
                      />
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <Label htmlFor="email">Email address</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={submitting}
                      placeholder="founder@vantage-ars.co.za"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete={setupMode ? "new-password" : "current-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={submitting}
                      placeholder="••••••••••••"
                    />
                  </div>

                  {!setupMode ? (
                    <div className="text-right">
                      <Link
                        to="/forgot-password"
                        search={{ email }}
                        className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent transition-colors hover:text-fg"
                      >
                        Forgot password?
                      </Link>
                    </div>
                  ) : null}

                  {setupMode && options?.setupTokenRequired ? (
                    <div className="space-y-2">
                      <Label htmlFor="founder-token">Founder setup token</Label>
                      <Input
                        id="founder-token"
                        name="founder-token"
                        type="password"
                        autoComplete="off"
                        value={founderToken}
                        onChange={(e) => setFounderToken(e.target.value)}
                        required
                        disabled={submitting}
                        placeholder="Enter setup token"
                      />
                    </div>
                  ) : null}

                  <Button type="submit" className="cta w-full justify-center" disabled={submitting}>
                    {submitting
                      ? "Authenticating…"
                      : setupMode
                        ? "Create founder account"
                        : "Enter command centre"}
                  </Button>
                </form>

                {options?.setupOpen ? (
                  <div className="mt-6 border-t border-border/60 pt-6">
                    <button
                      type="button"
                      className="w-full text-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted transition-colors hover:text-fg"
                      onClick={() => {
                        setError("");
                        setSetupMode((v) => !v);
                      }}
                    >
                      {setupMode ? "Return to sign in" : "First-time founder setup"}
                    </button>
                  </div>
                ) : null}

                {providers.length > 0 ? (
                  <div className="mt-7 border-t border-border/60 pt-7">
                    <div className="mb-4 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                      Federated access
                    </div>
                    <div className="grid gap-3">
                      {providers.map((provider) => (
                        <Button
                          key={provider.providerId}
                          type="button"
                          variant="outline"
                          disabled={submitting}
                          onClick={() => handleOAuth(provider.providerId)}
                          className="w-full justify-center"
                        >
                          {provider.label ?? provider.providerId}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            <div className="mt-6 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
              <span>Authenticated operations only</span>
              <span>No customer data on this screen</span>
            </div>
          </div>
        </main>

        <footer className="border-t border-border/60 bg-bg/60 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 font-mono text-[10px] uppercase tracking-[0.16em] text-muted lg:px-8">
            <span>{COMPANY.legalName}</span>
            <span>Private operations desk</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
