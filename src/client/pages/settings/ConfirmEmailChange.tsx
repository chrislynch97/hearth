import { Button, Group, Modal, Stack, Text } from "@mantine/core";

export interface ConfirmEmailChangeProps {
    opened: boolean;
    /** The address about to be saved. */
    email: string;
    pending: "save" | "send" | null;
    onCancel: () => void;
    onConfirm: (sendConfirmation: boolean) => void;
}

/** Confirm-on-save for a changed email address (#198). The new address starts
 *  unconfirmed, which quietly takes password reset away — so say it here, where
 *  the person is causing it. Sending stays an explicit press rather than a side
 *  effect of saving, so a mistyped address never mails a stranger on its own. */
export const ConfirmEmailChange = ({
    opened,
    email,
    pending,
    onCancel,
    onConfirm,
}: ConfirmEmailChangeProps) => (
    <Modal
        opened={opened}
        onClose={onCancel}
        title="Confirm your new email address"
        centered
    >
        <Stack gap="md">
            <Text size="sm">
                Password reset only ever mails a confirmed address, so until you
                confirm <b>{email}</b> you won&apos;t be able to reset your
                password if you forget it.
            </Text>
            <Text size="sm" c="dimmed">
                Sending the link now is the quickest way to keep that working.
                It lasts 24 hours, and you can send another from this page at
                any time.
            </Text>
            <Group justify="space-between">
                <Button
                    variant="subtle"
                    onClick={onCancel}
                    disabled={pending !== null}
                >
                    Cancel
                </Button>
                <Group gap="sm">
                    <Button
                        variant="default"
                        onClick={() => onConfirm(false)}
                        loading={pending === "save"}
                        disabled={pending === "send"}
                    >
                        Save without sending
                    </Button>
                    <Button
                        onClick={() => onConfirm(true)}
                        loading={pending === "send"}
                        disabled={pending === "save"}
                    >
                        Save and send link
                    </Button>
                </Group>
            </Group>
        </Stack>
    </Modal>
);
