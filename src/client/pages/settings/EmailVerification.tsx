import { useState } from "react";
import { Alert, Anchor, Badge, Button, Group, Text } from "@mantine/core";
import { trpc } from "@/trpc";

/** Confirmation state for the account's email address, and the button that sends
 *  a fresh link (#111). Only rendered on an instance that can send mail — an
 *  address on a self-host install with no relay is just a note to itself, and
 *  telling people to "confirm" it with no way to would be nonsense. */
export const EmailVerification = () => {
    const status = trpc.email.status.useQuery();
    const send = trpc.email.sendVerification.useMutation();

    const [error, setError] = useState("");
    const [sentTo, setSentTo] = useState("");

    const data = status.data;

    if (!data?.enabled || !data.email) return null;

    const handleSend = async () => {
        setError("");
        try {
            await send.mutateAsync();
            setSentTo(data.email ?? "");
        } catch (e) {
            setError(
                e instanceof Error
                    ? e.message
                    : "Could not send the verification email."
            );
        }
    };

    if (data.verified) {
        return (
            <Group gap="xs">
                <Badge color="moss" variant="light">
                    Confirmed
                </Badge>
                <Text size="xs" c="dimmed">
                    This address can be used to reset your password.
                </Text>
            </Group>
        );
    }

    return (
        <>
            <Group gap="xs">
                <Badge color="orange" variant="light">
                    Not confirmed
                </Badge>
                <Text size="xs" c="dimmed" style={{ flex: 1 }}>
                    Confirm this address so you can reset your password if you
                    lose it.
                </Text>
                <Button
                    size="compact-sm"
                    variant="default"
                    onClick={() => void handleSend()}
                    loading={send.isPending}
                >
                    Send confirmation email
                </Button>
            </Group>
            {sentTo && (
                <Alert color="moss" variant="light" title="Email sent">
                    <Text size="sm">
                        Check <b>{sentTo}</b> for a confirmation link. It
                        expires in 24 hours — if it doesn&apos;t arrive, check
                        your spam folder or{" "}
                        <Anchor
                            component="button"
                            type="button"
                            size="sm"
                            onClick={() => void handleSend()}
                        >
                            send another
                        </Anchor>
                        .
                    </Text>
                </Alert>
            )}
            {error && (
                <Alert color="red" title="Error">
                    {error}
                </Alert>
            )}
        </>
    );
};
