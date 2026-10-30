import { useState } from "react";
import { trpc } from "@/trpc";
import { Switch } from "@/components/shadcn/switch";
import { Button } from "@/components/ui/Button";
import { CopyField } from "@/components/ui/CopyField";
import { Notice } from "@/components/ui/Notice";
import { SettingsRow } from "@/components/ui/SettingsRow";
import { SettingsSection } from "@/components/ui/SettingsSection";
import { TextField } from "@/components/ui/TextField";
import { ComposeOutdatedNotice } from "./ComposeOutdatedNotice";

/** Where the Updating docs live — linked when the host updater isn't installed. */
const DOCS_UPDATING_URL =
    "https://github.com/chrislynch97/hearth/blob/main/docs/deployment.md#updating--three-ways";

const LINK = "font-semibold text-primary underline";

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
        <SettingsSection
            title="Updates"
            description="Which version is running, and how new ones get installed."
        >
            <SettingsRow
                title="Version"
                description={
                    <>
                        You&apos;re running{" "}
                        <code className="font-mono text-text">
                            {current ?? "…"}
                        </code>
                        .
                    </>
                }
            >
                <Button
                    disabled={check.isFetching}
                    onClick={() => void check.refetch()}
                >
                    Check for updates
                </Button>
            </SettingsRow>

            {settings && (
                <ComposeOutdatedNotice outdated={settings.composeOutdated} />
            )}

            {settings?.deployMode === "image" && !settings.updaterOnline && (
                <Notice tone="attention" title="The host updater isn't running">
                    One-click and automatic updates need it.{" "}
                    <a
                        href={DOCS_UPDATING_URL}
                        target="_blank"
                        rel="noreferrer"
                        className={LINK}
                    >
                        Set it up
                    </a>{" "}
                    to turn them on.
                </Notice>
            )}

            {settings?.updateResult && !settings.updateResult.ok && (
                <Notice tone="danger" title="The last update attempt failed">
                    {settings.updateResult.error ?? "Unknown error"}.
                </Notice>
            )}

            {status && !status.checked && (
                <Notice
                    tone="attention"
                    title="Couldn't reach GitHub to check for updates"
                >
                    Try again when you&apos;re online.
                </Notice>
            )}

            {status && status.checked && !status.updateAvailable && (
                <Notice
                    tone="positive"
                    title={
                        status.latest === null
                            ? "No published releases to compare against yet."
                            : status.current === "unknown"
                              ? `Latest release is ${status.latest}. This build doesn't report its own version, so an update can't be confirmed.`
                              : "You're up to date."
                    }
                />
            )}

            {status && status.updateAvailable && (
                <div className="flex flex-col gap-4 rounded-lg border border-primary/25 bg-primary-tint-weak p-4">
                    <p className="text-md font-semibold text-text">
                        Update available: {status.latest}
                        {status.releaseUrl && (
                            <>
                                {" · "}
                                <a
                                    href={status.releaseUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={LINK}
                                >
                                    Release notes
                                </a>
                            </>
                        )}
                    </p>
                    {settings?.updaterOnline ? (
                        <>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <Button
                                    variant="solid"
                                    disabled={
                                        applyUpdate.isPending ||
                                        applying ||
                                        settings.updatePending
                                    }
                                    onClick={() => void handleApply()}
                                >
                                    Update now
                                </Button>
                                <span className="text-sm text-text-muted">
                                    {settings.preUpdateBackup
                                        ? "Backs up first, then installs and restarts."
                                        : "Installs the update and restarts."}
                                </span>
                            </div>
                            {(applying || settings.updatePending) && (
                                <Notice tone="info" title="Update in progress">
                                    The app will restart shortly and come back
                                    on the new version.
                                </Notice>
                            )}
                        </>
                    ) : (
                        <ol className="flex flex-col gap-4">
                            <li className="flex flex-col gap-2">
                                <span className="text-base font-semibold text-text">
                                    1. Back up first
                                </span>
                                <div className="flex flex-wrap items-center gap-3">
                                    <Button
                                        disabled={backupNow.isPending}
                                        onClick={() => void handleBackup()}
                                    >
                                        Back up now
                                    </Button>
                                    {backupMsg && (
                                        <span className="text-sm text-text-muted">
                                            {backupMsg}
                                        </span>
                                    )}
                                </div>
                            </li>
                            <li className="flex flex-col gap-2">
                                <span className="text-base font-semibold text-text">
                                    2. Then run on the host
                                </span>
                                <CopyField
                                    label="Update commands"
                                    value={status.commands}
                                    multiline
                                />
                            </li>
                        </ol>
                    )}
                </div>
            )}

            {settings && (
                <>
                    <SettingsRow
                        title="Check for updates automatically"
                        description="Checks GitHub about once an hour and shows a banner when a new version is available."
                    >
                        <Switch
                            aria-label="Check for updates automatically"
                            checked={settings.autoPoll}
                            onCheckedChange={(autoPoll) => save({ autoPoll })}
                        />
                    </SettingsRow>
                    <SettingsRow
                        title="Back up before updating"
                        description="Writes a backup first whenever an update is installed."
                    >
                        <Switch
                            aria-label="Back up before updating"
                            checked={settings.preUpdateBackup}
                            onCheckedChange={(preUpdateBackup) =>
                                save({ preUpdateBackup })
                            }
                        />
                    </SettingsRow>
                    <SettingsRow
                        title="Install updates automatically"
                        description={
                            settings.updaterOnline
                                ? "Installs new versions for you without running any commands."
                                : settings.deployMode === "image"
                                  ? "Needs the host updater running — see the note above."
                                  : "Only available on the managed Docker image deploy."
                        }
                    >
                        <Switch
                            aria-label="Install updates automatically"
                            checked={settings.autoUpdate}
                            disabled={!settings.updaterOnline}
                            onCheckedChange={(autoUpdate) =>
                                save({ autoUpdate })
                            }
                        />
                    </SettingsRow>
                    {settings.updaterOnline && settings.autoUpdate && (
                        <TextField
                            label="Install at"
                            description="Leave blank to install as soon as an update is found."
                            type="time"
                            value={settings.autoUpdateTime ?? ""}
                            onChange={(e) =>
                                save({
                                    autoUpdateTime:
                                        e.currentTarget.value || null,
                                })
                            }
                            className="max-w-40"
                        />
                    )}
                </>
            )}
        </SettingsSection>
    );
};
