import { useState } from "react";
import {
    Alert,
    Button,
    Checkbox,
    Divider,
    Group,
    Modal,
    PasswordInput,
    Select,
    Stack,
    Text,
} from "@mantine/core";
import { trpc } from "@/trpc";
import { MIN_PASSWORD_LENGTH, validatePassword } from "@shared/password-policy";

export interface AccessListProps {
    isOwner: boolean;
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

    const [pendingRemove, setPendingRemove] = useState<string | null>(null);
    const [signOutFor, setSignOutFor] = useState<{
        userId: string;
        name: string;
    } | null>(null);
    const [resetFor, setResetFor] = useState<{
        userId: string;
        name: string;
        mfaEnabled: boolean;
    } | null>(null);
    const [newPw, setNewPw] = useState("");
    const [clearMfa, setClearMfa] = useState(false);
    // One dismissible "that worked, and here's what it means" line, shared by the
    // password reset and by a removal that also deleted the account.
    const [notice, setNotice] = useState("");
    const [error, setError] = useState("");

    const roleOptions = [
        { value: "viewer", label: "Viewer" },
        { value: "member", label: "Member" },
        ...(isOwner
            ? [
                  { value: "admin", label: "Admin" },
                  { value: "owner", label: "Owner" },
              ]
            : []),
    ];

    const changeRole = async (userId: string, role: string) => {
        setError("");
        try {
            await setRole.mutateAsync({
                userId,
                role: role as "owner" | "admin" | "member" | "viewer",
            });
            await utils.access.list.invalidate();
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Could not change the role."
            );
        }
    };

    const confirmRemove = async (userId: string, name: string) => {
        setError("");
        setNotice("");
        try {
            const { accountDeleted } = await remove.mutateAsync({ userId });
            setPendingRemove(null);
            // Say so when this was their last household: their account went with
            // the membership (#230), which is more than "removed from here" and
            // isn't something to discover later.
            if (accountDeleted) {
                setNotice(
                    `${name} has been removed, and their account deleted — this was the only household they belonged to. Anything they entered here stays.`
                );
            }
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
        setNotice("");
        try {
            const { count } = await revokeSessions.mutateAsync({
                userId: signOutFor.userId,
            });
            setSignOutFor(null);
            setNotice(
                count === 0
                    ? `${signOutFor.name} had no active sessions.`
                    : `Signed ${signOutFor.name} out of ${count} session${count === 1 ? "" : "s"}. Their password is unchanged, so they can sign back in.`
            );
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

    const rows = list.data ?? [];

    return (
        <>
            <Divider label="People with access" labelPosition="left" />
            {error && (
                <Alert color="red" title="Error">
                    {error}
                </Alert>
            )}
            {notice && (
                <Alert
                    color="moss"
                    variant="light"
                    withCloseButton
                    onClose={() => setNotice("")}
                >
                    {notice}
                </Alert>
            )}
            <Stack gap={6}>
                {rows.map((r) => {
                    const elevated = r.role === "admin" || r.role === "owner";
                    const canManage = !r.isYou && (elevated ? isOwner : true);
                    return (
                        <Group
                            key={r.userId}
                            justify="space-between"
                            px="xs"
                            py={4}
                        >
                            <div style={{ minWidth: 0 }}>
                                <Text size="sm" truncate>
                                    {r.displayName}
                                    {r.isYou && (
                                        <Text span size="xs" c="dimmed">
                                            {" "}
                                            (you)
                                        </Text>
                                    )}
                                </Text>
                                <Text size="xs" c="dimmed" truncate>
                                    @{r.username} · {r.role}
                                    {r.mfaEnabled ? " · 2FA on" : ""}
                                </Text>
                            </div>
                            {/* Four controls don't fit beside a name on a phone,
                                so both this group and the row wrap rather than
                                clipping the last one out of reach. */}
                            {canManage ? (
                                <Group gap={6}>
                                    <Select
                                        size="xs"
                                        w={116}
                                        data={roleOptions}
                                        value={r.role}
                                        allowDeselect={false}
                                        onChange={(v) =>
                                            v &&
                                            v !== r.role &&
                                            void changeRole(r.userId, v)
                                        }
                                    />
                                    <Button
                                        size="compact-xs"
                                        variant="subtle"
                                        onClick={() => {
                                            setNotice("");
                                            setSignOutFor({
                                                userId: r.userId,
                                                name: r.displayName,
                                            });
                                        }}
                                    >
                                        Sign out
                                    </Button>
                                    <Button
                                        size="compact-xs"
                                        variant="subtle"
                                        onClick={() => {
                                            setNotice("");
                                            setClearMfa(false);
                                            setResetFor({
                                                userId: r.userId,
                                                name: r.displayName,
                                                mfaEnabled: r.mfaEnabled,
                                            });
                                        }}
                                    >
                                        Reset password
                                    </Button>
                                    {pendingRemove === r.userId ? (
                                        <Button
                                            size="compact-xs"
                                            color="red"
                                            loading={remove.isPending}
                                            onClick={() =>
                                                void confirmRemove(
                                                    r.userId,
                                                    r.displayName
                                                )
                                            }
                                        >
                                            Confirm
                                        </Button>
                                    ) : (
                                        <Button
                                            size="compact-xs"
                                            variant="subtle"
                                            color="red"
                                            onClick={() =>
                                                setPendingRemove(r.userId)
                                            }
                                        >
                                            Remove
                                        </Button>
                                    )}
                                </Group>
                            ) : (
                                !r.isYou && (
                                    <Text size="xs" c="dimmed">
                                        owner-managed
                                    </Text>
                                )
                            )}
                        </Group>
                    );
                })}
            </Stack>

            <Modal
                opened={signOutFor !== null}
                onClose={() => setSignOutFor(null)}
                title={`Sign out — ${signOutFor?.name ?? ""}`}
                size="sm"
            >
                <Stack gap="sm">
                    {/* The name lives in the title, not mid-sentence: it clears
                        as the modal fades, which would leave a broken clause. */}
                    <Text size="sm">
                        Ends every session they have, on every device. Reach for
                        this when one of their logins looks wrong — it&apos;s
                        the smallest thing that stops it.
                    </Text>
                    <Text size="xs" c="dimmed">
                        Their password, two-factor and access are untouched, so
                        they can sign straight back in. If you think their
                        password is compromised, reset it instead. If they
                        belong to other households, this signs them out of those
                        too.
                    </Text>
                    <Group justify="flex-end">
                        <Button
                            variant="default"
                            onClick={() => setSignOutFor(null)}
                        >
                            Cancel
                        </Button>
                        <Button
                            color="red"
                            onClick={() => void confirmSignOut()}
                            loading={revokeSessions.isPending}
                        >
                            Sign them out
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            <Modal
                opened={resetFor !== null}
                onClose={() => setResetFor(null)}
                title={`Reset password — ${resetFor?.name ?? ""}`}
                size="sm"
            >
                <Stack gap="sm">
                    <Text size="xs" c="dimmed">
                        Set a new password for this member, then share it with
                        them out-of-band. They&apos;ll be signed out of any
                        active sessions.
                    </Text>
                    <PasswordInput
                        label="New password"
                        value={newPw}
                        onChange={(e) => setNewPw(e.currentTarget.value)}
                        description={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                    />
                    {resetFor?.mfaEnabled && (
                        <Checkbox
                            checked={clearMfa}
                            onChange={(e) =>
                                setClearMfa(e.currentTarget.checked)
                            }
                            label="Also turn off two-factor authentication"
                            description="Tick this if they've lost their authenticator and their recovery codes — otherwise a new password alone won't get them in."
                        />
                    )}
                    <Group justify="flex-end">
                        <Button
                            variant="default"
                            onClick={() => setResetFor(null)}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={() => void submitReset()}
                            loading={resetPassword.isPending}
                        >
                            Reset password
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </>
    );
};
