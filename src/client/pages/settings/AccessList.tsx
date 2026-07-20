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

/** The people with accepted access to the active household: change a role,
 *  reset a locked-out member's password, or revoke access. Admin+ only; the
 *  server enforces that only owners touch owners/admins. */
export const AccessList = ({ isOwner }: AccessListProps) => {
    const utils = trpc.useUtils();
    const list = trpc.access.list.useQuery();
    const setRole = trpc.access.setRole.useMutation();
    const remove = trpc.access.remove.useMutation();
    const resetPassword = trpc.access.resetPassword.useMutation();

    const [pendingRemove, setPendingRemove] = useState<string | null>(null);
    const [resetFor, setResetFor] = useState<{
        userId: string;
        name: string;
        mfaEnabled: boolean;
    } | null>(null);
    const [newPw, setNewPw] = useState("");
    const [clearMfa, setClearMfa] = useState(false);
    const [resetMsg, setResetMsg] = useState("");
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

    const confirmRemove = async (userId: string) => {
        setError("");
        try {
            await remove.mutateAsync({ userId });
            setPendingRemove(null);
            await utils.access.list.invalidate();
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Could not remove access."
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
            setResetMsg(
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
            {resetMsg && (
                <Alert
                    color="moss"
                    variant="light"
                    withCloseButton
                    onClose={() => setResetMsg("")}
                >
                    {resetMsg}
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
                            wrap="nowrap"
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
                            {canManage ? (
                                <Group gap={6} wrap="nowrap">
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
                                            setResetMsg("");
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
                                                void confirmRemove(r.userId)
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
