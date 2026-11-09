import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { PrivateDoor } from "./private-door";

/**
 * The locked door shared by the founder-only pages outside `/office`
 * (`/dashboard`, `/database-browser`).
 *
 * The server decides who the founder is; this only decides what to paint while
 * the session resolves and when it does not. Waiting out `isPending` matters:
 * treating "user is null" as signed out would flash the door on every reload
 * of an already signed-in founder.
 */
export function PrivateGate() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <PrivatePending />;
  return <PrivateDoor user={user} />;
}

/** Shape of the page while its server data is still loading. */
export function PrivatePending() {
  return (
    <div className="min-h-dvh bg-bg p-6">
      <Skeleton className="h-14 w-full" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}
