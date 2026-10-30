import { useRef, useState } from "react";
import { trpc } from "@/trpc";
import { useFormatDate } from "@/useMoney";
import { downloadBlob, downloadJson, toCsv } from "@/csv";
import { zipStore } from "@/zip";
import { Button } from "@/components/ui/Button";
import { ChoiceField } from "@/components/ui/ChoiceField";
import { Notice } from "@/components/ui/Notice";
import { SettingsRow } from "@/components/ui/SettingsRow";
import { SettingsSection } from "@/components/ui/SettingsSection";
import { OffsiteRestore } from "./OffsiteRestore";
import { msToLocalIso } from "./util";

type BackupFrequency = "off" | "daily" | "weekly";

/** The instance's backups: when they run, taking one now, downloading a copy,
 *  and putting one back. */
export const DataSection = () => {
    const utils = trpc.useUtils();
    const ctx = trpc.bootstrap.context.useQuery();
    const fmt = useFormatDate();
    const importMut = trpc.data.import.useMutation();
    const updateHousehold = trpc.household.update.useMutation();
    const backupNow = trpc.data.backupNow.useMutation();
    const backups = trpc.data.listBackups.useQuery();
    const fileRef = useRef<HTMLInputElement>(null);

    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    const hh = ctx.data?.household;
    const lastBackup = hh?.backupLastAt
        ? `Last: ${fmt(msToLocalIso(hh.backupLastAt.getTime()))} ${hh.backupLastAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
        : "None yet.";
    const where =
        backups.data?.primary === "offsite"
            ? `Written to your ${backups.data.kind} off-site target; the local copy is staging only.`
            : "Written to a backups folder next to your database; the last 14 are kept.";

    const setFrequency = async (frequency: BackupFrequency) => {
        await updateHousehold.mutateAsync({ backupFrequency: frequency });
        await utils.bootstrap.context.invalidate();
    };

    const handleBackupNow = async () => {
        setError("");
        setMessage("");
        let result;
        try {
            // Under HEARTH_BACKUP_PRIMARY=offsite a failed upload fails the whole
            // backup, so this rejects rather than reporting a partial success.
            result = await backupNow.mutateAsync();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Backup failed.");
            return;
        }
        await utils.bootstrap.context.invalidate();
        // The snapshot just written is one of the restorable ones now.
        await utils.data.listBackups.invalidate();
        if (result.offsite && !result.offsite.ok) {
            setMessage(`Backup written to ${result.file}.`);
            setError(`Off-site copy failed: ${result.offsite.error}`);
            return;
        }
        const offsite = result.offsite?.ok
            ? ` Off-site copy uploaded (${result.offsite.kind}).`
            : "";
        setMessage(`Backup written to ${result.file}.${offsite}`);
    };

    const handleExport = async () => {
        setError("");
        const data = await utils.data.export.fetch();
        // Date + time (to the second) so multiple backups on the same day don't collide
        // and sort chronologically. e.g. hearth-backup-2026-07-07-143005.json
        const stamp = new Date()
            .toISOString()
            .slice(0, 19)
            .replace("T", "-")
            .replace(/:/g, "");
        downloadJson(`hearth-backup-${stamp}.json`, data);
        setMessage("Backup downloaded.");
    };

    const handleExportCsv = async () => {
        setError("");
        const snapshot = await utils.data.export.fetch();
        const entries = Object.entries(snapshot.tables)
            .filter(([, rows]) => rows.length > 0)
            .map(([name, rows]) => {
                const cols = Object.keys(rows[0] ?? {});
                const table: Array<Array<string | number>> = [
                    cols,
                    ...rows.map((row) =>
                        cols.map((c) => {
                            const v = row[c];
                            if (v === null || v === undefined) return "";
                            return typeof v === "object"
                                ? JSON.stringify(v)
                                : (v as string | number);
                        })
                    ),
                ];
                return {
                    name: `${name}.csv`,
                    data: new TextEncoder().encode(toCsv(table)),
                };
            });
        if (entries.length === 0) {
            setError("No data to export yet.");
            return;
        }
        const stamp = new Date().toISOString().slice(0, 10);
        downloadBlob(`hearth-csv-${stamp}.zip`, zipStore(entries));
        setMessage(`Exported ${entries.length} tables as CSV.`);
    };

    const handleImportFile = async (file: File) => {
        setError("");
        setMessage("");
        try {
            const parsed = JSON.parse(await file.text());
            await importMut.mutateAsync(parsed);
            await utils.invalidate();
            setMessage("Data restored from backup.");
        } catch (e) {
            setError(
                e instanceof Error
                    ? e.message
                    : "Import failed — is this a valid Hearth backup?"
            );
        }
    };

    return (
        <SettingsSection
            title="Backups"
            description="Copies of everything on this instance, and how to put one back."
        >
            <SettingsRow
                title="Automatic backups"
                description={`${where} ${lastBackup}`}
            >
                <ChoiceField
                    label="Frequency"
                    hideLabel
                    options={[
                        { value: "off", label: "Off" },
                        { value: "daily", label: "Daily" },
                        { value: "weekly", label: "Weekly" },
                    ]}
                    value={(hh?.backupFrequency ?? "off") as BackupFrequency}
                    onChange={(v) => void setFrequency(v)}
                    className="w-32"
                />
                <Button
                    disabled={backupNow.isPending}
                    onClick={() => void handleBackupNow()}
                >
                    Back up now
                </Button>
            </SettingsRow>
            <SettingsRow
                title="Download a copy"
                description="JSON is the portable backup format, the one Restore takes. CSV is one file per table, zipped — handy for spreadsheets."
            >
                <Button onClick={() => void handleExportCsv()}>
                    Download CSV
                </Button>
                <Button onClick={() => void handleExport()}>
                    Download JSON
                </Button>
            </SettingsRow>
            <SettingsRow
                title="Restore"
                description="Replace all current data with a backup file. This cannot be undone."
            >
                <Button
                    disabled={importMut.isPending}
                    onClick={() => fileRef.current?.click()}
                >
                    Restore from file
                </Button>
                <input
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => {
                        const file = e.currentTarget.files?.[0];
                        if (file) void handleImportFile(file);
                        e.currentTarget.value = "";
                    }}
                />
            </SettingsRow>
            <OffsiteRestore />
            {message && <Notice tone="positive" title={message} />}
            {error && <Notice tone="danger" title={error} />}
        </SettingsSection>
    );
};
