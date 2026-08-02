import { useState } from "react";
import {
    Alert,
    Anchor,
    Button,
    Card,
    Code,
    CopyButton,
    Divider,
    Group,
    Stack,
    Switch,
    Text,
    Title,
} from "@mantine/core";
import { TimeInput } from "@mantine/dates";
import { trpc } from "@/trpc";
import { ComposeDriftAlert } from "./ComposeDriftAlert";

/** Where the Updating docs live — linked when the host updater isn't installed. */
const DOCS_UPDATING_URL =
    "https://github.com/chrislynch97/hearth/blob/main/docs/deployment.md#updating--three-ways";

/** Shows the running version and, on demand, whether a newer GitHub release
 *  exists, plus the owner's update preferences (background polling, backup-first,
 *  and — on the managed deploy — automatic installs). Applying the update stays a
 *  copy-pasteable host command until the managed updater is present (Phase 2b). */
export const UpdatesSection = () => {
    const utils = trpc.useUtils();
    const versionQuery = trpc.data.version.useQuery();
    const settingsQuery = trpc.data.updateSettings.useQuery();
    // On demand only — a settings load shouldn't fire a GitHub request every time.
    const check = trpc.data.checkForUpdates.useQuery(undefined, {
        enabled: false,
        gcTime: 0,
    });
    const backupNow = trpc.data.backupNow.useMutation();
    const applyUpdate = trpc.data.applyUpdate.useMutation();
    const saveSettings = trpc.data.setUpdateSettings.useMutation({
        onSuccess: () => utils.data.updateSettings.invalidate(),
    });
    const [backupMsg, setBackupMsg] = useState("");
    const [applying, setApplying] = useState(false);

    const current = versionQuery.data?.version;
    const status = check.data;
    const settings = settingsQuery.data;

    const handleBackup = async () => {
        setBackupMsg("");
        const result = await backupNow.mutateAsync();
        setBackupMsg(`Backup written to ${result.file}.`);
    };

    const handleApply = async () => {
        await applyUpdate.mutateAsync();
        // The host updater is about to pull + recreate this container, so the
        // request may not even return — from here the app just goes away and
        // comes back on the new version.
        setApplying(true);
    };

    const save = (patch: Parameters<typeof saveSettings.mutate>[0]) =>
        saveSettings.mutate(patch);

    return (
        <Card withBorder padding="md" radius="md">
            <Title order={4} mb="sm">
                Updates
            </Title>
            <Group justify="space-between" wrap="nowrap" mb="sm">
                <Text size="sm" c="dimmed">
                    Current version: <Code>{current ?? "…"}</Code>
                </Text>
                <Button
                    size="xs"
                    variant="default"
                    loading={check.isFetching}
                    onClick={() => void check.refetch()}
                >
                    Check for updates
                </Button>
            </Group>

            {settings && (
                <ComposeDriftAlert settings={settings.missingSettings} />
            )}

            {settings?.deployMode === "image" && !settings.updaterOnline && (
                <Alert color="yellow" variant="light" mb="sm">
                    One-click and automatic updates need the host updater, which
                    isn't running on this host.{" "}
                    <Anchor
                        href={DOCS_UPDATING_URL}
                        target="_blank"
                        rel="noreferrer"
                    >
                        Set it up
                    </Anchor>{" "}
                    to turn them on.
                </Alert>
            )}

            {settings?.updateResult && !settings.updateResult.ok && (
                <Alert color="red" variant="light" mb="sm">
                    The last update attempt failed:{" "}
                    {settings.updateResult.error ?? "unknown error"}.
                </Alert>
            )}

            {status && !status.checked && (
                <Alert color="yellow" variant="light">
                    Couldn't reach GitHub to check for updates. Try again when
                    you're online.
                </Alert>
            )}

            {status && status.checked && !status.updateAvailable && (
                <Alert color="green" variant="light">
                    {status.latest === null
                        ? "No published releases to compare against yet."
                        : status.current === "unknown"
                          ? `Latest release is ${status.latest}. This build doesn't report its own version, so an update can't be confirmed.`
                          : "You're up to date."}
                </Alert>
            )}

            {status && status.updateAvailable && (
                <Stack gap="md">
                    <Alert color="blue" variant="light">
                        Update available: <b>{status.latest}</b>
                        {status.releaseUrl && (
                            <>
                                {" — "}
                                <Anchor
                                    href={status.releaseUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    release notes
                                </Anchor>
                            </>
                        )}
                    </Alert>

                    {settings?.updaterOnline ? (
                        <div>
                            <Group gap="sm">
                                <Button
                                    size="xs"
                                    loading={applyUpdate.isPending}
                                    disabled={
                                        applying || settings.updatePending
                                    }
                                    onClick={() => void handleApply()}
                                >
                                    Update now
                                </Button>
                                <Text size="sm" c="dimmed">
                                    {settings.preUpdateBackup
                                        ? "Backs up first, then installs and restarts."
                                        : "Installs the update and restarts."}
                                </Text>
                            </Group>
                            {(applying || settings.updatePending) && (
                                <Alert color="blue" variant="light" mt="sm">
                                    Update in progress — the app will restart
                                    shortly and come back on the new version.
                                </Alert>
                            )}
                        </div>
                    ) : (
                        <>
                            <div>
                                <Text size="sm" fw={500} mb={4}>
                                    1. Back up first
                                </Text>
                                <Group gap="sm">
                                    <Button
                                        size="xs"
                                        variant="default"
                                        loading={backupNow.isPending}
                                        onClick={() => void handleBackup()}
                                    >
                                        Back up now
                                    </Button>
                                    {backupMsg && (
                                        <Text size="sm" c="dimmed">
                                            {backupMsg}
                                        </Text>
                                    )}
                                </Group>
                            </div>

                            <div>
                                <Text size="sm" fw={500} mb={4}>
                                    2. Then run on the host
                                </Text>
                                <Group
                                    align="flex-start"
                                    gap="xs"
                                    wrap="nowrap"
                                >
                                    <Code block style={{ flex: 1 }}>
                                        {status.commands}
                                    </Code>
                                    <CopyButton value={status.commands}>
                                        {({ copied, copy }) => (
                                            <Button
                                                size="xs"
                                                variant="default"
                                                onClick={copy}
                                            >
                                                {copied ? "Copied" : "Copy"}
                                            </Button>
                                        )}
                                    </CopyButton>
                                </Group>
                            </div>
                        </>
                    )}
                </Stack>
            )}

            {settings && (
                <>
                    <Divider my="md" />
                    <Stack gap="sm">
                        <Switch
                            label="Check for updates automatically"
                            description="Checks GitHub about once an hour and shows a banner when a new version is available."
                            checked={settings.autoPoll}
                            onChange={(e) =>
                                save({ autoPoll: e.currentTarget.checked })
                            }
                        />
                        <Switch
                            label="Back up before updating"
                            description="Writes a backup first whenever an update is installed."
                            checked={settings.preUpdateBackup}
                            onChange={(e) =>
                                save({
                                    preUpdateBackup: e.currentTarget.checked,
                                })
                            }
                        />
                        <div>
                            <Switch
                                label="Install updates automatically"
                                description={
                                    settings.updaterOnline
                                        ? "Installs new versions for you without running any commands."
                                        : settings.deployMode === "image"
                                          ? "Needs the host updater running — see the setup guide above."
                                          : "Only available on the managed Docker image deploy."
                                }
                                checked={settings.autoUpdate}
                                disabled={!settings.updaterOnline}
                                onChange={(e) =>
                                    save({
                                        autoUpdate: e.currentTarget.checked,
                                    })
                                }
                            />
                            {settings.updaterOnline && settings.autoUpdate && (
                                <TimeInput
                                    label="Install at"
                                    description="Leave blank to install as soon as an update is found."
                                    value={settings.autoUpdateTime ?? ""}
                                    onChange={(e) =>
                                        save({
                                            autoUpdateTime:
                                                e.currentTarget.value || null,
                                        })
                                    }
                                    mt="xs"
                                    maw={150}
                                />
                            )}
                        </div>
                    </Stack>
                </>
            )}
        </Card>
    );
};
