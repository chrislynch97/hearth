import { Alert, Anchor } from "@mantine/core";
import { useState } from "react";
import { Link } from "react-router-dom";
import { trpc } from "@/trpc";

// Per-version dismissal: once dismissed, the banner stays hidden until a newer
// release appears (the stored tag no longer matches `latest`).
const DISMISS_KEY = "hearth:update-dismissed";

/** App-wide "update available" banner (issue #81). Instance-owner only; reads the
 *  cached update status and polls it hourly. Dismissible per version. */
export const UpdateBanner = () => {
    const me = trpc.users.me.useQuery();
    const isOwner = me.data?.isInstanceOwner ?? false;
    const status = trpc.data.updateStatus.useQuery(undefined, {
        enabled: isOwner,
        refetchInterval: 60 * 60 * 1000,
        refetchOnWindowFocus: false,
    });
    const [dismissed, setDismissed] = useState(() =>
        localStorage.getItem(DISMISS_KEY)
    );

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

    return (
        <Alert
            color="blue"
            variant="light"
            withCloseButton
            onClose={dismiss}
            title={`Update available: ${latest}`}
            mb="lg"
        >
            A new version of Hearth is available.{" "}
            <Anchor component={Link} to="/settings/system">
                View details
            </Anchor>
        </Alert>
    );
};
