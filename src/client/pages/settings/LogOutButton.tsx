import { LogOut } from "lucide-react";
import { trpc } from "@/trpc";
import { forgetThisDevice } from "@/lib/pushSubscription";
import { Button } from "@/components/ui/Button";

/** Signs you out of this browser. Hidden on an open instance with no password,
 *  where there's nothing to sign back in to. */
export const LogOutButton = () => {
    const utils = trpc.useUtils();
    const status = trpc.auth.status.useQuery();
    const logout = trpc.auth.logout.useMutation();
    const unsubscribe = trpc.notifications.unsubscribe.useMutation({
        meta: { suppressErrorToast: true },
    });

    if (!status.data?.passwordSet) return null;

    const logOut = async () => {
        // First: it needs the session this is about to end.
        await forgetThisDevice((endpoint) =>
            unsubscribe.mutateAsync({ endpoint })
        );
        await logout.mutateAsync();
        // Invalidate ONLY auth.status: it re-fetches alone and returns 200
        // (authenticated: false), flipping the app to the login screen. Invalidating
        // everything would re-fire the protected queries — still mounted for a tick —
        // which the locked HTTP gate 401s as a batch, erroring auth.status with them
        // and surfacing the connection-error screen instead of the login gate.
        await utils.auth.status.invalidate();
    };

    return (
        <Button
            variant="ghost"
            icon={<LogOut size={15} strokeWidth={1.75} />}
            disabled={logout.isPending}
            onClick={() => void logOut()}
        >
            Log out
        </Button>
    );
};
