import { useState } from "react";
import { trpc } from "@/trpc";
import { MIN_PASSWORD_LENGTH, validatePassword } from "@shared/password-policy";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Notice } from "@/components/ui/Notice";
import { TextField } from "@/components/ui/TextField";
import { AccessRow, type AccessRole } from "./AccessRow";

export interface AccessListProps {
    isOwner: boolean;
}

interface Person {
    userId: string;
    name: string;
    mfaEnabled: boolean;
}

/** The people with accepted access to the active household: change a role, end
 *  someone's sessions, reset a locked-out member's password, or revoke access.
 *  Admin+ only; the server enforces that only owners touch owners/admins. */
export const AccessList = ({ isOwner }: AccessListProps) => {
    const utils = trpc.useUtils();
    const list = trpc.access.list.useQuery();
    const setRole = trpc.access.setRole.useMutation();
    const remove = trpc.access.remove.useMutation();
    const resetPassword = trpc.access.resetPassword.useMutation();
    const revokeSessions = trpc.access.revokeSessions.useMutation();

    const [removeFor, setRemoveFor] = useState<Person | null>(null);
    const [signOutFor, setSignOutFor] = useState<Person | null>(null);
    const [resetFor, setResetFor] = useState<Person | null>(null);
    const [newPw, setNewPw] = useState("");
    const [clearMfa, setClearMfa] = useState(false);
    // One "that worked, and here's what it means" line, shared by the password
    // reset, the sign-out and a removal that also deleted the account.
    const [notice, setNotice] = useState("");
    const [error, setError] = useState("");

    const rows = list.data ?? [];
    const dialogOpen = Boolean(removeFor || signOutFor || resetFor);
    const roleOptions: Array<{ value: AccessRole; label: string }> = [
        { value: "viewer", label: "Viewer" },
        { value: "member", label: "Member" },
        ...(isOwner
            ? [
                  { value: "admin" as const, label: "Admin" },
                  { value: "owner" as const, label: "Owner" },
              ]
            : []),
    ];

    const open = (setter: (p: Person) => void, person: Person) => {
        setError("");
        setNotice("");
        setter(person);
    };

    const changeRole = async (userId: string, role: AccessRole) => {
        setError("");
        try {
            await setRole.mutateAsync({ userId, role });
            await utils.access.list.invalidate();
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Could not change the role."
            );
        }
    };

    const confirmRemove = async () => {
        if (!removeFor) return;
        setError("");
        try {
            const { accountDeleted } = await remove.mutateAsync({
                userId: removeFor.userId,
            });
            // Say so when this was their last household: their account went with
            // the membership (#230), which is more than "removed from here" and
            // isn't something to discover later.
            if (accountDeleted) {
                setNotice(
                    `${removeFor.name} has been removed, and their account deleted — this was the only household they belonged to. Anything they entered here stays.`
                );
            }
            setRemoveFor(null);
            await utils.access.list.invalidate();
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Could not remove access."
            );
        }
    };

    const confirmSignOut = async () => {
        if (!signOutFor) return;
        setError("");
        try {
            const { count } = await revokeSessions.mutateAsync({
                userId: signOutFor.userId,
            });
            setNotice(
                count === 0
                    ? `${signOutFor.name} had no active sessions.`
                    : `Signed ${signOutFor.name} out of ${count} session${count === 1 ? "" : "s"}. Their password is unchanged, so they can sign back in.`
            );
            setSignOutFor(null);
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Could not end their sessions."
            );
        }
    };

    const submitReset = async () => {
        if (!resetFor) return;
        setError("");
        const weak = validatePassword(newPw);
        if (weak) return setError(weak);
        try {
            await resetPassword.mutateAsync({
                userId: resetFor.userId,
                newPassword: newPw,
                clearMfa,
            });
            const twoFactor =
                clearMfa && resetFor.mfaEnabled
                    ? " Their 2FA is off — ask them to set it up again."
                    : "";
            setNotice(
                `Password reset for ${resetFor.name}. Share it with them; they'll be signed out.${twoFactor}`
            );
            setResetFor(null);
            setNewPw("");
            setClearMfa(false);
            await utils.access.list.invalidate();
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Could not reset the password."
            );
        }
    };

    // Inside the open dialog while there is one, so the message isn't hidden
    // behind it — and only ever once.
    const errorNotice = error ? <Notice tone="danger" title={error} /> : null;

    return (
        <>
            {!dialogOpen && errorNotice}
            {notice && <Notice tone="positive" title={notice} />}
            <ul className="flex flex-col divide-y divide-border">
                {rows.map((r) => {
                    const elevated = r.role === "admin" || r.role === "owner";
                    const person = {
                        userId: r.userId,
                        name: r.displayName,
                        mfaEnabled: r.mfaEnabled,
                    };
                    return (
                        <AccessRow
                            key={r.userId}
                            person={r}
                            canManage={!r.isYou && (elevated ? isOwner : true)}
                            roleOptions={roleOptions}
                            onRole={(role) => void changeRole(r.userId, role)}
                            onSignOut={() => open(setSignOutFor, person)}
                            onResetPassword={() => {
                                setClearMfa(false);
                                setNewPw("");
                                open(setResetFor, person);
                            }}
                            onRemove={() => open(setRemoveFor, person)}
                        />
                    );
                })}
            </ul>

            <ConfirmDialog
                open={signOutFor !== null}
                onOpenChange={(o) => !o && setSignOutFor(null)}
                title={`Sign out — ${signOutFor?.name ?? ""}`}
                tone="danger"
                confirm={{
                    label: "Sign them out",
                    onClick: () => void confirmSignOut(),
                    pending: revokeSessions.isPending,
                }}
            >
                {/* The name lives in the title, not mid-sentence: it clears as
                    the dialog fades, which would leave a broken clause. */}
                <p>
                    Ends every session they have, on every device. Reach for
                    this when one of their logins looks wrong — it&apos;s the
                    smallest thing that stops it.
                </p>
                <p className="text-text-muted">
                    Their password, two-factor and access are untouched, so they
                    can sign straight back in. If you think their password is
                    compromised, reset it instead. If they belong to other
                    households, this signs them out of those too.
                </p>
                {errorNotice}
            </ConfirmDialog>

            <ConfirmDialog
                open={resetFor !== null}
                onOpenChange={(o) => !o && setResetFor(null)}
                title={`Reset password — ${resetFor?.name ?? ""}`}
                description="Set a new password for this member, then share it with them out-of-band. They'll be signed out of any active sessions."
                confirm={{
                    label: "Reset password",
                    onClick: () => void submitReset(),
                    pending: resetPassword.isPending,
                }}
            >
                <TextField
                    label="New password"
                    type="password"
                    autoComplete="new-password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.currentTarget.value)}
                    description={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                />
                {resetFor?.mfaEnabled && (
                    <CheckboxField
                        checked={clearMfa}
                        onCheckedChange={setClearMfa}
                        label="Also turn off two-factor authentication"
                        description="Tick this if they've lost their authenticator and their recovery codes — otherwise a new password alone won't get them in."
                    />
                )}
                {errorNotice}
            </ConfirmDialog>

            <ConfirmDialog
                open={removeFor !== null}
                onOpenChange={(o) => !o && setRemoveFor(null)}
                title={`Remove ${removeFor?.name ?? ""}?`}
                description="They lose access to this household straight away. Anything they entered stays."
                tone="danger"
                confirm={{
                    label: "Remove access",
                    onClick: () => void confirmRemove(),
                    pending: remove.isPending,
                }}
            >
                {errorNotice}
            </ConfirmDialog>
        </>
    );
};
