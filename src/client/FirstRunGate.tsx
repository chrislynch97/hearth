import { useState } from "react";
import {
    Alert,
    Button,
    Card,
    Center,
    Group,
    PasswordInput,
    Stack,
    Text,
} from "@mantine/core";
import { trpc } from "./trpc";
import { hearthTokens } from "./theme";
import { MIN_PASSWORD_LENGTH, validatePassword } from "@shared/password-policy";

/** First-run recovery screen for an instance that's open (no owner password) yet
 *  exposed off-box with no `HEARTH_ALLOW_OPEN` opt-in. In that state the server's
 *  HTTP gate 403s every protected procedure, so the normal app is dead; the only
 *  way through the UI is to set an owner password, which locks the instance and
 *  logs the owner in (#34). This calls only `auth.setPassword`, which is on the
 *  gate's allowlist and sent unbatched (see providers.tsx), so it isn't dragged
 *  down by a blocked batch. */
export function FirstRunGate() {
    const utils = trpc.useUtils();
    const setPassword = trpc.auth.setPassword.useMutation();

    const [password, setPassword_] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState("");

    const submit = async () => {
        setError("");
        const weak = validatePassword(password);
        if (weak) return setError(weak);
        if (password !== confirm) return setError("Passwords do not match.");
        try {
            // No `currentPassword`: the owner account is still password-less on first run.
            await setPassword.mutateAsync({ newPassword: password });
            // Setting the password locks the instance and logs the owner in via the
            // session cookie. Re-read auth.status (and everything else) so the app
            // re-renders into the authenticated view.
            await utils.invalidate();
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Could not set your password."
            );
        }
    };

    return (
        <Center h="100vh">
            <Card withBorder padding="xl" radius="lg" w={380}>
                <Stack gap="md">
                    <Group gap={10} justify="center">
                        <svg
                            width="28"
                            height="28"
                            viewBox="0 0 48 48"
                            fill="none"
                        >
                            <polyline
                                points="8,25 24,10 40,25"
                                stroke={hearthTokens.brand.moss}
                                strokeWidth="3.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            <path
                                d="M14 25 V40 H34 V25"
                                stroke={hearthTokens.brand.moss}
                                strokeWidth="3.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            <circle
                                cx="24"
                                cy="32"
                                r="3.8"
                                fill={hearthTokens.brand.apricot}
                            />
                        </svg>
                        <Text
                            fw={500}
                            fz={22}
                            style={{
                                fontFamily:
                                    "var(--mantine-font-family-headings)",
                            }}
                        >
                            Hearth
                        </Text>
                    </Group>

                    <Text size="sm" c="dimmed" ta="center">
                        Set an owner password to secure this instance.
                    </Text>

                    <Alert color="yellow" variant="light" p="sm">
                        <Text size="xs">
                            This instance is reachable from the network with no
                            password set, so it's currently locked down. Choose
                            an owner password to unlock it — anyone who can
                            reach this address would otherwise have full access.
                        </Text>
                    </Alert>

                    <PasswordInput
                        label="Owner password"
                        description={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                        value={password}
                        onChange={(e) => setPassword_(e.currentTarget.value)}
                        autoComplete="new-password"
                        autoFocus
                    />
                    <PasswordInput
                        label="Confirm password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.currentTarget.value)}
                        onKeyDown={(e) => e.key === "Enter" && void submit()}
                        error={error || undefined}
                        autoComplete="new-password"
                    />
                    <Button
                        onClick={() => void submit()}
                        loading={setPassword.isPending}
                        fullWidth
                    >
                        Set password &amp; unlock
                    </Button>
                </Stack>
            </Card>
        </Center>
    );
}
