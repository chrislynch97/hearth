import { useState } from "react";
import { trpc } from "@/trpc";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Notice } from "@/components/ui/Notice";
import { SettingsRow } from "@/components/ui/SettingsRow";
import { TextField } from "@/components/ui/TextField";

/** What the operator types to confirm. Long enough that it can't be a slip,
 *  short enough to get right at 2am. */
const CONFIRM_PHRASE = "sign out everyone";

/** Settings → System → Sign everyone out: break-glass containment for the
 *  instance owner (#248). A row in the System danger zone.
 *
 *  The lever for when you don't yet know *which* session is the problem — a
 *  leaked backup, a suspected host compromise, a token of unknown provenance.
 *  Every other route needs you to name a person first. `npm run end-all-sessions`
 *  on the box does the same thing when the app won't start; the runbook
 *  (docs/legal/breach-runbook.md) points at both. */
export const SignOutEveryoneSection = () => {
    const revokeAll = trpc.sessions.revokeAll.useMutation();

    const [confirming, setConfirming] = useState(false);
    const [typed, setTyped] = useState("");
    const [error, setError] = useState("");

    const handleRevokeAll = async () => {
        setError("");
        try {
            await revokeAll.mutateAsync();
        } catch (e) {
            setConfirming(false);
            setError(
                e instanceof Error ? e.message : "Couldn't end the sessions."
            );
            return;
        }
        // Our own session was among them, so every cached query on this screen
        // is now unauthenticated. Reload rather than invalidate: the app
        // re-bootstraps straight onto the sign-in screen.
        window.location.href = "/";
    };

    return (
        <>
            <SettingsRow
                title="Sign everyone out"
                danger
                description="End every session on this instance, so everyone — including you — signs in again. For when you suspect a session or a backup has been exposed and don't know whose. No password, data or access changes."
            >
                <Button
                    variant="danger"
                    onClick={() => {
                        setTyped("");
                        setConfirming(true);
                    }}
                >
                    Sign everyone out
                </Button>
            </SettingsRow>
            {error && <Notice tone="danger" title={error} />}

            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title="Sign everyone out?"
                tone="danger"
                confirm={{
                    label: "Sign everyone out",
                    onClick: () => void handleRevokeAll(),
                    pending: revokeAll.isPending,
                    disabled: typed.trim().toLowerCase() !== CONFIRM_PHRASE,
                }}
            >
                <div>
                    <p>This immediately:</p>
                    <ul className="mt-1.5 list-disc space-y-1 pl-5">
                        <li>
                            ends every session on this instance, on every device
                        </li>
                        <li>
                            signs you out too — you&apos;ll need your password,
                            and your authenticator if you use one
                        </li>
                        <li>
                            leaves passwords, two-factor and data untouched, so
                            anyone who still has their credentials can sign
                            straight back in
                        </li>
                    </ul>
                </div>
                <p className="text-text-secondary">
                    If a password may be compromised, change it as well — this
                    only ends the sessions.
                </p>
                <TextField
                    label={`Type ${CONFIRM_PHRASE} to confirm`}
                    value={typed}
                    onChange={(e) => setTyped(e.currentTarget.value)}
                    autoComplete="off"
                />
            </ConfirmDialog>
        </>
    );
};
