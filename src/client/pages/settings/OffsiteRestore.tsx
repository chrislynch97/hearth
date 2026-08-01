import { useState } from "react";
import {
    Alert,
    Button,
    Divider,
    Group,
    Modal,
    Select,
    Stack,
    Text,
} from "@mantine/core";
import { trpc } from "@/trpc";
import { useFormatDate } from "@/useMoney";
import { msToLocalIso } from "./util";

const formatSize = (bytes: number): string =>
    bytes >= 1024 * 1024
        ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Restore from the off-site store (#114). On a hosted instance the off-site copy
 *  is the backup, and there's no filesystem to download a snapshot from — so the
 *  server fetches and decrypts it rather than the browser. Renders nothing when
 *  off-site backups are switched off, which is the self-hosted default. */
export const OffsiteRestore = () => {
    const utils = trpc.useUtils();
    const fmt = useFormatDate();
    const backups = trpc.data.listBackups.useQuery();
    const restore = trpc.data.restoreBackup.useMutation();

    const [selected, setSelected] = useState<string | null>(null);
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState("");

    const handleRestore = async () => {
        if (!selected) return;
        setConfirming(false);
        setError("");
        try {
            await restore.mutateAsync({ name: selected });
            await utils.invalidate();
            // The snapshot replaces every table, including the signed-in user —
            // reload rather than leave the app rendering pre-restore state.
            window.location.href = "/";
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Restoring that backup failed."
            );
        }
    };

    if (!backups.data || backups.data.kind === null) return null;

    const { kind, restorable, entries, primary } = backups.data;

    return (
        <>
            <Divider />
            <Group justify="space-between" align="flex-end">
                <div>
                    <Text size="sm" fw={500}>
                        Restore from off-site
                    </Text>
                    <Text size="xs" c="dimmed">
                        Encrypted copies held at your{" "}
                        <Text span ff="monospace" fz="xs">
                            {kind}
                        </Text>{" "}
                        target
                        {primary === "offsite"
                            ? " — the primary store for this instance."
                            : "."}{" "}
                        Replaces all current data. This cannot be undone.
                    </Text>
                </div>
                {restorable && (
                    <Group gap="sm" align="flex-end">
                        <Select
                            label="Backup"
                            size="xs"
                            w={260}
                            placeholder={
                                entries.length === 0
                                    ? "None stored yet"
                                    : "Choose a backup"
                            }
                            disabled={entries.length === 0}
                            data={entries.map((entry) => ({
                                value: entry.name,
                                label: `${fmt(msToLocalIso(entry.at))} · ${formatSize(entry.size)}`,
                            }))}
                            value={selected}
                            onChange={setSelected}
                        />
                        <Button
                            variant="default"
                            size="xs"
                            disabled={!selected}
                            loading={restore.isPending}
                            onClick={() => setConfirming(true)}
                        >
                            Restore
                        </Button>
                    </Group>
                )}
            </Group>
            {backups.data.error && (
                <Alert color="red" title="Off-site backups are not working">
                    {backups.data.error}
                </Alert>
            )}
            {!restorable && !backups.data.error && (
                <Alert color="yellow" variant="light">
                    A {kind} target is write-only, so backups can't be listed or
                    restored from here. Switch to an <code>s3</code> or{" "}
                    <code>directory</code> target to restore in the app.
                </Alert>
            )}
            {error && (
                <Alert color="red" title="Error">
                    {error}
                </Alert>
            )}

            <Modal
                opened={confirming}
                onClose={() => setConfirming(false)}
                title="Restore this backup?"
                size="sm"
            >
                <Stack gap="md">
                    <Text size="sm">
                        Every member, pot, outgoing, spend, payslip and raise is
                        replaced with the contents of this backup, and everyone
                        signs in with the credentials they had when it was
                        taken. There is no undo.
                    </Text>
                    <Group justify="flex-end">
                        <Button
                            variant="default"
                            onClick={() => setConfirming(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            color="red"
                            loading={restore.isPending}
                            onClick={() => void handleRestore()}
                        >
                            Restore
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </>
    );
};
