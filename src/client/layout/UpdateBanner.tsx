import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { trpc } from "@/trpc";

// Per-version dismissal: once dismissed, the banner stays hidden until a newer
// release appears (the stored tag no longer matches `latest`).
const DISMISS_KEY = "hearth:update-dismissed";

/** App-wide "update available" banner (issue #81). Instance-owner only; reads the
 *  cached update status and polls it hourly. Offers one-click apply when a host
 *  updater is online, else links to the details. Dismissible per version. */
export const UpdateBanner = () => {
    const me = trpc.users.me.useQuery();
    const isOwner = me.data?.isInstanceOwner ?? false;
    const status = trpc.data.updateStatus.useQuery(undefined, {
        enabled: isOwner,
        refetchInterval: 60 * 60 * 1000,
        refetchOnWindowFocus: false,
    });
    const settings = trpc.data.updateSettings.useQuery(undefined, {
        enabled: isOwner,
    });
    const applyUpdate = trpc.data.applyUpdate.useMutation();
    const [dismissed, setDismissed] = useState(() =>
        localStorage.getItem(DISMISS_KEY)
    );
    const [applying, setApplying] = useState(false);

    const latest = status.data?.latest ?? null;

    if (
        !isOwner ||
        !status.data?.updateAvailable ||
        !latest ||
        dismissed === latest
    ) {
        return null;
    }

    const dismiss = () => {
        localStorage.setItem(DISMISS_KEY, latest);
        setDismissed(latest);
    };

    const apply = async () => {
        await applyUpdate.mutateAsync();
        setApplying(true);
    };

    const canApply =
        settings.data?.updaterOnline && !settings.data.updatePending;

    return (
        <div className="hearth-ds mb-5">
            <Notice
                title={`Update available: ${latest}`}
                action={
                    canApply ? (
                        <Button
                            variant="solid"
                            disabled={applyUpdate.isPending || applying}
                            onClick={() => void apply()}
                        >
                            Update now
                        </Button>
                    ) : (
                        <Button asChild>
                            <Link to="/settings/system">View details</Link>
                        </Button>
                    )
                }
                onDismiss={dismiss}
            >
                {applying
                    ? "Updating — the app will restart shortly."
                    : "A new version of Hearth is available."}
            </Notice>
        </div>
    );
};
