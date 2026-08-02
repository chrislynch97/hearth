import { useState } from "react";
import {
    Alert,
    Box,
    Button,
    Card,
    Group,
    List,
    Modal,
    PasswordInput,
    Stack,
    Text,
    TextInput,
    Title,
} from "@mantine/core";
import { trpc } from "@/trpc";

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
        <Card withBorder padding="md" radius="md">
            <Title order={4} mb="sm">
                Delete your account
            </Title>
            <Group justify="space-between" align="flex-start">
                <Box flex={1} miw={260}>
                    <Text size="xs" c="dimmed">
                        {reason}
                    </Text>
                </Box>
                <Button
                    color="red"
                    variant="light"
                    disabled={blocked}
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
            </Group>

            <Modal
                opened={opened}
                onClose={() => setOpened(false)}
                title="Delete your account?"
                size="md"
            >
                <Stack gap="md">
                    <Text size="sm">This permanently deletes:</Text>
                    <List size="sm" spacing={4}>
                        <List.Item>
                            your login — name, username, email address, password
                            and two-factor enrolment
                        </List.Item>
                        <List.Item>
                            every session you have open, on every device
                        </List.Item>
                        {households.map((h) => (
                            <List.Item key={h.id}>
                                {h.name}, and everything in it — nobody else
                                belongs to it, so it goes with your account
                            </List.Item>
                        ))}
                    </List>
                    <Text size="sm">
                        Spending, payslips and pots you entered in households
                        that other people are still in stay where they are; the
                        person they were filed under simply stops being linked
                        to an account. Backups already taken still contain a
                        copy until they roll off.
                    </Text>
                    <Text size="sm">
                        Download your data first if you want to keep it.
                    </Text>
                    {passwordRequired && (
                        <PasswordInput
                            label="Current password"
                            value={password}
                            onChange={(e) => setPassword(e.currentTarget.value)}
                        />
                    )}
                    {mfaRequired && (
                        <TextInput
                            label="Authentication code"
                            description="From your authenticator app, or one of your recovery codes."
                            value={code}
                            onChange={(e) => setCode(e.currentTarget.value)}
                            autoComplete="one-time-code"
                        />
                    )}
                    <TextInput
                        label={`Type ${username} to confirm`}
                        value={typed}
                        onChange={(e) => setTyped(e.currentTarget.value)}
                        autoComplete="off"
                    />
                    {error && (
                        <Alert color="red" title="Error">
                            {error}
                        </Alert>
                    )}
                    <Group justify="flex-end">
                        <Button
                            variant="default"
                            onClick={() => setOpened(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            color="red"
                            disabled={
                                typed.trim() !== username ||
                                (passwordRequired && !password) ||
                                (mfaRequired && !code)
                            }
                            loading={deleteMut.isPending}
                            onClick={() => void handleDelete()}
                        >
                            Delete my account
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Card>
    );
};
