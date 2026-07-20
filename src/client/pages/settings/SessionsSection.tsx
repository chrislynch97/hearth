import { useState } from "react";
import {
    Alert,
    Button,
    Card,
    Group,
    Loader,
    Table,
    Text,
    Title,
} from "@mantine/core";
import { trpc } from "@/trpc";
import { useFormatDate } from "@/useMoney";

/** Turn a raw user-agent into something a person can recognise their own device
 *  by. Deliberately crude: this only has to be good enough to tell "the laptop I
 *  am on" from "something I don't recognise", and a full UA parser would be a
 *  dependency and a maintenance burden for a label. Unknown agents fall back to
 *  the raw string rather than a confident-sounding guess. */
const describeUserAgent = (ua: string | null): string => {
    if (!ua) return "Unknown device";
    const browser = /Edg\//.test(ua)
        ? "Edge"
        : /OPR\//.test(ua)
          ? "Opera"
          : /Firefox\//.test(ua)
            ? "Firefox"
            : /Chrome\//.test(ua)
              ? "Chrome"
              : /Safari\//.test(ua)
                ? "Safari"
                : null;
    const os = /Windows/.test(ua)
        ? "Windows"
        : /Android/.test(ua)
          ? "Android"
          : /iPhone|iPad|iOS/.test(ua)
            ? "iOS"
            : /Mac OS X/.test(ua)
              ? "macOS"
              : /Linux/.test(ua)
                ? "Linux"
                : null;
    if (!browser && !os) return ua.slice(0, 60);
    return [browser, os].filter(Boolean).join(" on ");
};

export const SessionsSection = () => {
    const utils = trpc.useUtils();
    const sessions = trpc.sessions.list.useQuery();
    const revoke = trpc.sessions.revoke.useMutation();
    const revokeOthers = trpc.sessions.revokeOthers.useMutation();
    const formatDate = useFormatDate();
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    const refresh = async () => {
        await Promise.all([
            utils.sessions.list.invalidate(),
            utils.auth.status.invalidate(),
        ]);
    };

    const handleRevoke = async (ref: string) => {
        setError("");
        setMessage("");
        try {
            const res = await revoke.mutateAsync({ ref });
            // Ending the session you're on is a logout: the cookie is already
            // gone, so send the app back through the front door.
            if (res.endedCurrent) {
                window.location.assign("/");
                return;
            }
            await refresh();
            setMessage("Session ended.");
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Could not end that session."
            );
        }
    };

    const handleRevokeOthers = async () => {
        setError("");
        setMessage("");
        try {
            const { count } = await revokeOthers.mutateAsync();
            await refresh();
            setMessage(
                count === 0
                    ? "No other sessions to end."
                    : `Ended ${count} other session(s).`
            );
        } catch (e) {
            setError(
                e instanceof Error
                    ? e.message
                    : "Could not sign out your other sessions."
            );
        }
    };

    const rows = sessions.data ?? [];
    const others = rows.filter((s) => !s.current).length;

    return (
        <Card withBorder padding="md" radius="md">
            <Title order={4} mb="xs">
                Active sessions
            </Title>
            <Text size="sm" c="dimmed" mb="sm">
                Every device currently signed in as you. A session ends on its
                own after 14 days of inactivity, and after 90 days regardless.
                If you don’t recognise one, end it — then change your password.
            </Text>
            {sessions.isLoading ? (
                <Loader size="sm" />
            ) : (
                <Table verticalSpacing={6}>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Device</Table.Th>
                            <Table.Th>From</Table.Th>
                            <Table.Th>Last active</Table.Th>
                            <Table.Th />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {rows.map((s) => (
                            <Table.Tr key={s.ref}>
                                <Table.Td>
                                    <Group gap="xs">
                                        <Text size="sm">
                                            {describeUserAgent(s.userAgent)}
                                        </Text>
                                        {s.current && (
                                            <Text size="xs" c="dimmed">
                                                (this device)
                                            </Text>
                                        )}
                                    </Group>
                                </Table.Td>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">
                                        {s.ip ?? "—"}
                                    </Text>
                                </Table.Td>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">
                                        {/* en-CA renders as YYYY-MM-DD, which is what the
                                            household date formatter parses (see AuditLogSection).
                                            The time matters here — "yesterday" is not enough to
                                            recognise a session by — so show it alongside. */}
                                        {formatDate(
                                            s.lastSeenAt.toLocaleDateString(
                                                "en-CA"
                                            )
                                        )}{" "}
                                        {s.lastSeenAt.toLocaleTimeString()}
                                    </Text>
                                </Table.Td>
                                <Table.Td ta="right">
                                    <Button
                                        size="compact-xs"
                                        variant="subtle"
                                        color="red"
                                        loading={revoke.isPending}
                                        onClick={() => void handleRevoke(s.ref)}
                                    >
                                        {s.current ? "Sign out" : "End"}
                                    </Button>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            )}
            {error && (
                <Alert color="red" title="Error" mt="sm">
                    {error}
                </Alert>
            )}
            {message && (
                <Text size="sm" c="dimmed" mt="sm">
                    {message}
                </Text>
            )}
            <Group justify="flex-end" mt="sm">
                <Button
                    variant="light"
                    color="red"
                    disabled={others === 0}
                    loading={revokeOthers.isPending}
                    onClick={() => void handleRevokeOthers()}
                >
                    Sign out everywhere else
                </Button>
            </Group>
        </Card>
    );
};
