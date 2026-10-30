import { useState } from "react";
import { trpc } from "@/trpc";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Notice } from "@/components/ui/Notice";
import { SettingsRow } from "@/components/ui/SettingsRow";
import { SettingsSection } from "@/components/ui/SettingsSection";
import { PasswordField } from "@/components/ui/PasswordField";
import { TextField } from "@/components/ui/TextField";

/** Settings → Account → Delete your account (#230): erasing the login identity,
 *  as opposed to the household (Settings → Household → Your data).
 *
 *  Confirmed by password and, where enrolled, an authenticator code — the same
 *  bar as changing the username or turning two-factor off. The server decides
 *  what's blocked and what goes with the account; this only renders it, so the
 *  dialog can't promise an outcome the mutation won't deliver. */
export const DeleteAccountSection = () => {
    const me = trpc.users.me.useQuery();
    const impact = trpc.users.deletionImpact.useQuery();
    const deleteMut = trpc.users.deleteAccount.useMutation();

    const [opened, setOpened] = useState(false);
    const [password, setPassword] = useState("");
    const [code, setCode] = useState("");
    const [typed, setTyped] = useState("");
    const [error, setError] = useState("");

    if (!impact.data || !me.data) return null;

    const {
        blockedBy,
        households,
        isInstanceOwner,
        passwordRequired,
        mfaRequired,
    } = impact.data;
    const username = me.data.username;
    const blocked = isInstanceOwner || blockedBy.length > 0;

    const reason = isInstanceOwner
        ? "This is the instance owner's account. It's what the instance authenticates against, so removing it is a redeploy rather than a button — export the data and stand a new instance up instead."
        : blockedBy.length > 0
          ? `You're the only owner of ${blockedBy
                .map((h) => h.name)
                .join(
                    ", "
                )}, and other people are still in there. Make someone else an owner, or delete the household, before deleting your account.`
          : "Permanently erase your login — your name, username, email address, password and two-factor enrolment — and sign you out everywhere. This cannot be undone.";

    const handleDelete = async () => {
        setError("");
        try {
            await deleteMut.mutateAsync({
                currentPassword: passwordRequired ? password : undefined,
                code: mfaRequired ? code : undefined,
            });
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Couldn't delete your account."
            );
            return;
        }
        // The account this app was rendering for no longer exists, so reload
        // rather than invalidate: the client re-bootstraps onto the sign-in screen.
        window.location.href = "/";
    };

    return (
        <SettingsSection
            title="Danger zone"
            description="Things that can't be undone."
            tone="danger"
        >
            <SettingsRow
                title="Delete your account"
                description={reason}
                danger
            >
                {/* Blocked: the description says why, and a dead button adds
                    nothing to it. */}
                {!blocked && (
                    <Button
                        variant="danger"
                        onClick={() => {
                            setPassword("");
                            setCode("");
                            setTyped("");
                            setError("");
                            setOpened(true);
                        }}
                    >
                        Delete my account
                    </Button>
                )}
            </SettingsRow>

            <ConfirmDialog
                open={opened}
                onOpenChange={setOpened}
                title="Delete your account?"
                tone="danger"
                confirm={{
                    label: "Delete my account",
                    onClick: () => void handleDelete(),
                    pending: deleteMut.isPending,
                    disabled:
                        typed.trim() !== username ||
                        (passwordRequired && !password) ||
                        (mfaRequired && !code),
                }}
            >
                <div>
                    <p>This permanently deletes:</p>
                    <ul className="mt-1.5 list-disc space-y-1 pl-5">
                        <li>
                            your login — name, username, email address, password
                            and two-factor enrolment
                        </li>
                        <li>every session you have open, on every device</li>
                        {households.map((h) => (
                            <li key={h.id}>
                                {h.name}, and everything in it — nobody else
                                belongs to it, so it goes with your account
                            </li>
                        ))}
                    </ul>
                </div>
                <p className="text-text-secondary">
                    Spending, payslips and pots you entered in households that
                    other people are still in stay where they are; the person
                    they were filed under simply stops being linked to an
                    account. Backups already taken still contain a copy until
                    they roll off. Download your data first if you want to keep
                    it.
                </p>
                {passwordRequired && (
                    <PasswordField
                        label="Current password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.currentTarget.value)}
                    />
                )}
                {mfaRequired && (
                    <TextField
                        label="Authentication code"
                        description="From your authenticator app, or one of your recovery codes."
                        value={code}
                        onChange={(e) => setCode(e.currentTarget.value)}
                        autoComplete="one-time-code"
                    />
                )}
                <TextField
                    label={`Type ${username} to confirm`}
                    value={typed}
                    onChange={(e) => setTyped(e.currentTarget.value)}
                    autoComplete="off"
                />
                {error && <Notice tone="danger" title={error} />}
            </ConfirmDialog>
        </SettingsSection>
    );
};
