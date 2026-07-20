import { useState } from "react";
import {
    Alert,
    Button,
    Card,
    Group,
    PasswordInput,
    Stack,
    Text,
    Title,
} from "@mantine/core";
import { trpc } from "@/trpc";
import { MIN_PASSWORD_LENGTH, validatePassword } from "@shared/password-policy";

export const SecuritySection = () => {
    const utils = trpc.useUtils();
    const statusQuery = trpc.auth.status.useQuery();
    const setPassword = trpc.auth.setPassword.useMutation();
    const clearPassword = trpc.auth.clearPassword.useMutation();

    const passwordSet = statusQuery.data?.passwordSet ?? false;

    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [confirm, setConfirm] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    const reset = () => {
        setCurrent("");
        setNext("");
        setConfirm("");
    };

    const handleSet = async () => {
        setError("");
        setMessage("");
        const weak = validatePassword(next);
        if (weak) return setError(weak);
        if (next !== confirm) return setError("Passwords do not match.");
        try {
            await setPassword.mutateAsync({
                currentPassword: current || undefined,
                newPassword: next,
            });
            await utils.auth.status.invalidate();
            setMessage(passwordSet ? "Password changed." : "Password set.");
            reset();
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Could not update password."
            );
        }
    };

    const handleClear = async () => {
        setError("");
        setMessage("");
        try {
            await clearPassword.mutateAsync({ currentPassword: current });
            await utils.auth.status.invalidate();
            setMessage("Password removed.");
            reset();
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Could not remove password."
            );
        }
    };

    return (
        <Card withBorder padding="md" radius="md">
            <Title order={4} mb="sm">
                Security
            </Title>
            <Text size="xs" c="dimmed" mb="sm">
                Your account password. While it&apos;s unset the app is open on
                your network; setting one turns on login (anyone you invite
                signs in with their own account). For internet exposure, also
                put it behind a reverse proxy or Tailscale.
            </Text>
            <Stack gap="sm">
                {passwordSet && (
                    <PasswordInput
                        label="Current password"
                        value={current}
                        onChange={(e) => setCurrent(e.currentTarget.value)}
                    />
                )}
                <Group grow>
                    <PasswordInput
                        label={passwordSet ? "New password" : "Password"}
                        description={`At least ${MIN_PASSWORD_LENGTH} characters`}
                        value={next}
                        onChange={(e) => setNext(e.currentTarget.value)}
                    />
                    <PasswordInput
                        label="Confirm"
                        value={confirm}
                        onChange={(e) => setConfirm(e.currentTarget.value)}
                    />
                </Group>
                {message && (
                    <Alert color="moss" variant="light">
                        {message}
                    </Alert>
                )}
                {error && (
                    <Alert color="red" title="Error">
                        {error}
                    </Alert>
                )}
                <Group justify="flex-end" gap="sm">
                    {passwordSet && (
                        <Button
                            variant="light"
                            color="red"
                            loading={clearPassword.isPending}
                            onClick={() => void handleClear()}
                        >
                            Remove password
                        </Button>
                    )}
                    <Button
                        loading={setPassword.isPending}
                        onClick={() => void handleSet()}
                    >
                        {passwordSet ? "Change password" : "Set password"}
                    </Button>
                </Group>
            </Stack>
        </Card>
    );
};
