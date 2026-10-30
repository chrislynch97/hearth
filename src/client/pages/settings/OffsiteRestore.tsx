import { useState } from "react";
import { trpc } from "@/trpc";
import { useFormatDate } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { ChoiceField } from "@/components/ui/ChoiceField";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Notice } from "@/components/ui/Notice";
import { SettingsRow } from "@/components/ui/SettingsRow";
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

    if (!backups.data || backups.data.kind === null) return null;

    const { kind, restorable, entries, primary } = backups.data;

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

    return (
        <>
            <SettingsRow
                title="Restore from off-site"
                description={`Encrypted copies held at your ${kind} target${primary === "offsite" ? " — the primary store for this instance" : ""}. Replaces all current data. This cannot be undone.`}
            >
                {restorable && (
                    <>
                        <ChoiceField
                            label="Backup"
                            hideLabel
                            placeholder={
                                entries.length === 0
                                    ? "None stored yet"
                                    : "Choose a backup"
                            }
                            disabled={entries.length === 0}
                            options={entries.map((entry) => ({
                                value: entry.name,
                                label: `${fmt(msToLocalIso(entry.at))} · ${formatSize(entry.size)}`,
                            }))}
                            value={selected}
                            onChange={setSelected}
                            className="w-56"
                        />
                        <Button
                            disabled={!selected || restore.isPending}
                            onClick={() => setConfirming(true)}
                        >
                            Restore
                        </Button>
                    </>
                )}
            </SettingsRow>
            {backups.data.error && (
                <Notice tone="danger" title="Off-site backups are not working">
                    {backups.data.error}
                </Notice>
            )}
            {!restorable && !backups.data.error && (
                <Notice tone="attention" title="Write-only target">
                    A {kind} target can&apos;t be listed or restored from here.
                    Switch to an <code className="font-mono">s3</code> or{" "}
                    <code className="font-mono">directory</code> target to
                    restore in the app.
                </Notice>
            )}
            {error && <Notice tone="danger" title={error} />}

            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title="Restore this backup?"
                description="Every member, pot, outgoing, spend, payslip and raise is replaced with the contents of this backup, and everyone signs in with the credentials they had when it was taken. There is no undo."
                tone="danger"
                confirm={{
                    label: "Restore",
                    onClick: () => void handleRestore(),
                    pending: restore.isPending,
                }}
            />
        </>
    );
};
