import { Alert, Anchor, Badge, Button, Group, Text } from "@mantine/core";
import type { EmailConfirmation } from "@/useEmailConfirmation";

export interface EmailVerificationProps {
    confirmation: EmailConfirmation;
}

/** Confirmation state for the account's email address, and the button that sends
 *  a fresh link (#111). Only rendered on an instance that can send mail — an
 *  address on a self-host install with no relay is just a note to itself, and
 *  telling people to "confirm" it with no way to would be nonsense. State comes
 *  from the parent so the confirm-on-save dialog and this card agree (#198). */
export const EmailVerification = ({ confirmation }: EmailVerificationProps) => {
    const { enabled, email, verified, sentTo, error, sending, send } =
        confirmation;

    if (!enabled || !email) return null;

    return (
        <>
            {verified ? (
                <Group gap="xs">
                    <Badge color="moss" variant="light">
                        Confirmed
                    </Badge>
                    <Text size="xs" c="dimmed">
                        This address can be used to reset your password.
                    </Text>
                </Group>
            ) : (
                <Group gap="xs">
                    <Badge color="orange" variant="light">
                        Not confirmed
                    </Badge>
                    <Text size="xs" c="dimmed" style={{ flex: 1 }}>
                        Confirm this address so you can reset your password if
                        you lose it.
                    </Text>
                    <Button
                        size="compact-sm"
                        variant="default"
                        onClick={() => void send()}
                        loading={sending}
                    >
                        Send confirmation email
                    </Button>
                </Group>
            )}
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
                            onClick={() => void send()}
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
