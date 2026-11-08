import { createServerFn } from "@tanstack/react-start";

export type SignInOptions = {
  /** Founder email/password sign-in is available. */
  password: boolean;
  /** Google / X through the Grok broker is available. */
  oauth: boolean;
  /** The one-time founder setup is still open. */
  setupOpen: boolean;
  /** First-run setup asks for FOUNDER_SETUP_TOKEN (it is configured). */
  setupTokenRequired: boolean;
};

/** What the private door should offer. Reveals no account details. */
export const getSignInOptions = createServerFn({ method: "GET" }).handler(
  async (): Promise<SignInOptions> => {
    const [
      { oauthEnabled },
      { emailAndPasswordEnabled },
      { founderSetupOpen, setupTokenRequired },
    ] = await Promise.all([
      import("./server"),
      import("./email-password"),
      import("./founder-setup"),
    ]);
    let setupOpen: boolean;
    try {
      setupOpen = emailAndPasswordEnabled && (await founderSetupOpen());
    } catch {
      setupOpen = false;
    }
    return {
      password: emailAndPasswordEnabled,
      oauth: oauthEnabled,
      setupOpen,
      setupTokenRequired: setupTokenRequired(),
    };
  },
);
