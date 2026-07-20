import { useRef, useState } from "react";
import {
    Alert,
    Button,
    Card,
    Divider,
    Group,
    Modal,
    Select,
    Stack,
    Text,
    Title,
} from "@mantine/core";
import { trpc } from "@/trpc";
import { useFormatDate } from "@/useMoney";
import { downloadBlob, downloadJson, toCsv } from "@/csv";
import { zipStore } from "@/zip";
import { msToLocalIso } from "./util";

export const DataSection = () => {
    const utils = trpc.useUtils();
    const ctx = trpc.bootstrap.context.useQuery();
    const fmt = useFormatDate();
    const importMut = trpc.data.import.useMutation();
    const resetMut = trpc.data.reset.useMutation();
    const updateHousehold = trpc.household.update.useMutation();
    const backupNow = trpc.data.backupNow.useMutation();
    const fileRef = useRef<HTMLInputElement>(null);

    const hh = ctx.data?.household;
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [confirmReset, setConfirmReset] = useState(false);

    const setFrequency = async (frequency: "off" | "daily" | "weekly") => {
        await updateHousehold.mutateAsync({ backupFrequency: frequency });
        await utils.bootstrap.context.invalidate();
    };

    const handleBackupNow = async () => {
        setError("");
        const result = await backupNow.mutateAsync();
        await utils.bootstrap.context.invalidate();
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

    const handleReset = async () => {
        setConfirmReset(false);
        await resetMut.mutateAsync();
        // Fresh household → app returns to the setup wizard.
        window.location.href = "/";
    };

    return (
        <Card withBorder padding="md" radius="md">
            <Title order={4} mb="sm">
                Data
            </Title>
            <Stack gap="sm">
                <Group justify="space-between" align="flex-end">
                    <div>
                        <Text size="sm" fw={500}>
                            Automatic backups
                        </Text>
                        <Text size="xs" c="dimmed">
                            Written to a{" "}
                            <Text span ff="monospace" fz="xs">
                                backups/
                            </Text>{" "}
                            folder next to your database (last 14 kept).
                            {hh?.backupLastAt
                                ? ` Last: ${fmt(msToLocalIso(hh.backupLastAt.getTime()))} ${hh.backupLastAt.toLocaleTimeString()}.`
                                : " None yet."}
                        </Text>
                    </div>
                    <Group gap="sm" align="flex-end">
                        <Select
                            label="Frequency"
                            size="xs"
                            w={110}
                            data={[
                                { value: "off", label: "Off" },
                                { value: "daily", label: "Daily" },
                                { value: "weekly", label: "Weekly" },
                            ]}
                            value={hh?.backupFrequency ?? "off"}
                            onChange={(v) =>
                                void setFrequency(
                                    (v as "off" | "daily" | "weekly") ?? "off"
                                )
                            }
                            allowDeselect={false}
                        />
                        <Button
                            size="xs"
                            variant="default"
                            loading={backupNow.isPending}
                            onClick={() => void handleBackupNow()}
                        >
                            Back up now
                        </Button>
                    </Group>
                </Group>
                <Divider />
                <Group justify="space-between">
                    <div>
                        <Text size="sm" fw={500}>
                            Download backup
                        </Text>
                        <Text size="xs" c="dimmed">
                            JSON is the portable backup format (used by
                            Restore). CSV gives one file per table, zipped —
                            handy for spreadsheets.
                        </Text>
                    </div>
                    <Group gap="sm">
                        <Button
                            variant="default"
                            onClick={() => void handleExportCsv()}
                        >
                            Download CSV
                        </Button>
                        <Button
                            variant="default"
                            onClick={() => void handleExport()}
                        >
                            Download JSON
                        </Button>
                    </Group>
                </Group>
                <Divider />
                <Group justify="space-between">
                    <div>
                        <Text size="sm" fw={500}>
                            Restore
                        </Text>
                        <Text size="xs" c="dimmed">
                            Replace all current data with a backup file. This
                            cannot be undone.
                        </Text>
                    </div>
                    <Button
                        variant="default"
                        loading={importMut.isPending}
                        onClick={() => fileRef.current?.click()}
                    >
                        Restore from file
                    </Button>
                    <input
                        ref={fileRef}
                        type="file"
                        accept="application/json,.json"
                        style={{ display: "none" }}
                        onChange={(e) => {
                            const file = e.currentTarget.files?.[0];
                            if (file) void handleImportFile(file);
                            e.currentTarget.value = "";
                        }}
                    />
                </Group>
                <Divider />
                <Group justify="space-between">
                    <div>
                        <Text size="sm" fw={500} c="red">
                            Reset all data
                        </Text>
                        <Text size="xs" c="dimmed">
                            Wipe everything and start fresh from the setup
                            wizard.
                        </Text>
                    </div>
                    <Button
                        color="red"
                        variant="light"
                        onClick={() => setConfirmReset(true)}
                    >
                        Reset
                    </Button>
                </Group>
                {message && (
                    <Alert color="moss" variant="light">
                        {message}
                    </Alert>
                )}
                {error && (
                    <Alert color="red" title="Error">
                        {error}
                    </Alert>
                )}
            </Stack>

            <Modal
                opened={confirmReset}
                onClose={() => setConfirmReset(false)}
                title="Reset all data?"
                size="sm"
            >
                <Stack gap="md">
                    <Text size="sm">
                        This permanently deletes every member, pot, outgoing,
                        spend, payslip and raise, and returns to the setup
                        wizard. Consider downloading a backup first.
                    </Text>
                    <Group justify="flex-end">
                        <Button
                            variant="default"
                            onClick={() => setConfirmReset(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            color="red"
                            loading={resetMut.isPending}
                            onClick={() => void handleReset()}
                        >
                            Reset everything
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Card>
    );
};
