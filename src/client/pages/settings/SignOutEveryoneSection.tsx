import { useState } from "react";
import {
    Alert,
    Box,
    Button,
    Card,
    Group,
    List,
    Modal,
    Stack,
    Text,
    TextInput,
    Title,
} from "@mantine/core";
import { trpc } from "@/trpc";

/** What the operator types to confirm. Long enough that it can't be a slip,
 *  short enough to get right at 2am. */
const CONFIRM_PHRASE = "sign out everyone";

/** Settings → System → Sign everyone out: break-glass containment for the
 *  instance owner (#248).
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
        <Card withBorder padding="md" radius="md">
            <Title order={4} mb="sm">
                Sessions
            </Title>
            <Stack gap="sm">
                <Group justify="space-between" align="flex-start">
                    <Box flex={1} miw={260}>
                        <Text size="sm" fw={500}>
                            Sign everyone out
                        </Text>
                        <Text size="xs" c="dimmed">
                            End every session on this instance, so everyone —
                            including you — signs in again. Reach for this when
                            you suspect a session or a backup has been exposed
                            and you don&apos;t know whose. Nothing else changes:
                            no password, no data, no access.
                        </Text>
                    </Box>
                    <Button
                        color="red"
                        variant="light"
                        onClick={() => {
                            setTyped("");
                            setConfirming(true);
                        }}
                    >
                        Sign everyone out
                    </Button>
                </Group>
                {error && (
                    <Alert color="red" title="Error">
                        {error}
                    </Alert>
                )}
            </Stack>

            <Modal
                opened={confirming}
                onClose={() => setConfirming(false)}
                title="Sign everyone out?"
                size="md"
            >
                <Stack gap="md">
                    <Text size="sm">This immediately:</Text>
                    <List size="sm" spacing={4}>
                        <List.Item>
                            ends every session on this instance, on every device
                        </List.Item>
                        <List.Item>
                            signs you out too — you&apos;ll need your password,
                            and your authenticator if you use one
                        </List.Item>
                        <List.Item>
                            leaves passwords, two-factor and data untouched, so
                            anyone who still has their credentials can sign
                            straight back in
                        </List.Item>
                    </List>
                    <Text size="sm">
                        If a password may be compromised, change it as well —
                        this only ends the sessions.
                    </Text>
                    <TextInput
                        label={`Type ${CONFIRM_PHRASE} to confirm`}
                        value={typed}
                        onChange={(e) => setTyped(e.currentTarget.value)}
                        autoComplete="off"
                    />
                    <Group justify="flex-end">
                        <Button
                            variant="default"
                            onClick={() => setConfirming(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            color="red"
                            disabled={
                                typed.trim().toLowerCase() !== CONFIRM_PHRASE
                            }
                            loading={revokeAll.isPending}
                            onClick={() => void handleRevokeAll()}
                        >
                            Sign everyone out
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Card>
    );
};
