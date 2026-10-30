import { useState } from "react";
import { trpc } from "@/trpc";
import { useFormatDate } from "@/useMoney";
import { useFlash } from "@/hooks/useFlash";
import { Separator } from "@/components/shadcn/separator";
import { Switch } from "@/components/shadcn/switch";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Notice } from "@/components/ui/Notice";
import { SettingsRow } from "@/components/ui/SettingsRow";
import { SettingsSection } from "@/components/ui/SettingsSection";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { AuditEntryRow } from "./AuditEntryRow";

// How many entries to show at first, and how much each "Load more" reveals. The
// backend caps `list` at 500, so paging stops there.
const PAGE_SIZE = 25;
const MAX_ENTRIES = 500;

/** Household audit trail (issues #35/#41): who changed what, plus the retention
 *  window and a manual prune. Reads are admin-gated and pruning owner-gated, so
 *  the section only renders for admins and the prune only for the owner (the
 *  server enforces both regardless). */
export const AuditLogSection = () => {
    const utils = trpc.useUtils();
    const fmt = useFormatDate();
    const me = trpc.users.me.useQuery();
    const ctx = trpc.bootstrap.context.useQuery();
    const update = trpc.household.update.useMutation();
    const prune = trpc.audit.prune.useMutation();

    const role = me.data?.role ?? null;
    const isAdmin = role === "admin" || role === "owner";
    const isOwner = role === "owner";

    const [limit, setLimit] = useState(PAGE_SIZE);
    const entriesQuery = trpc.audit.list.useQuery(
        { limit },
        { enabled: isAdmin }
    );
    // Both controls show the household's value until edited, then the edit. Null
    // while the household loads, so neither flashes a default over a real value.
    const [retentionEdit, setRetention] = useState<string | null>(null);
    // Archive-before-prune toggle (issue #43).
    const [archiveEdit, setArchive] = useState<boolean | null>(null);
    const [savedRetention, flashSaved] = useFlash();
    const [confirmPrune, setConfirmPrune] = useState(false);
    const [pruneMsg, setPruneMsg] = useState("");
    const [error, setError] = useState("");

    if (!isAdmin) return null;

    const hh = ctx.data?.household;
    const entries = entriesQuery.data ?? [];
    const hasMore = entries.length >= limit && limit < MAX_ENTRIES;
    const retention =
        retentionEdit ??
        (hh?.auditRetentionDays !== undefined
            ? String(hh.auditRetentionDays)
            : "");
    const archive = archiveEdit ?? (hh ? hh.auditPruneArchive === 1 : false);
    const retentionOff = Number(retention) === 0;

    const handleSaveRetention = async () => {
        setError("");
        try {
            await update.mutateAsync({
                auditRetentionDays: Number(retention),
                auditPruneArchive: archive ? 1 : 0,
            });
            // The save itself is an audited household edit, so refresh the viewer
            // alongside the household (which feeds the retention field).
            await Promise.all([
                utils.bootstrap.context.invalidate(),
                utils.audit.list.invalidate(),
            ]);
            setRetention(null);
            setArchive(null);
            flashSaved();
        } catch (e) {
            setError(
                e instanceof Error
                    ? e.message
                    : "Could not save the retention window."
            );
        }
    };

    const handlePrune = async () => {
        setConfirmPrune(false);
        setError("");
        setPruneMsg("");
        try {
            const result = await prune.mutateAsync();
            await utils.audit.list.invalidate();
            setPruneMsg(
                result.pruned === 0
                    ? "Nothing to prune — no entries are older than the retention window."
                    : `Pruned ${result.pruned} ${result.pruned === 1 ? "entry" : "entries"} older than ${fmt(
                          (result.cutoff ?? new Date()).toLocaleDateString(
                              "en-CA"
                          )
                      )}.${result.archived ? " A copy was archived to disk first." : ""}`
            );
        } catch (e) {
            setError(
                e instanceof Error
                    ? e.message
                    : "Could not prune the audit log."
            );
        }
    };

    return (
        <SettingsSection
            title="Audit log"
            description="Who changed household data, plus sign-ins and access changes — roles, invitations, passwords and two-factor. Visible to admins."
        >
            <SettingsRow
                title="Keep history for"
                description="Older entries are pruned automatically. 0 keeps everything forever."
            >
                <TextField
                    label="Audit retention days"
                    hideLabel
                    className="w-28"
                    type="number"
                    min={0}
                    max={3650}
                    value={retention}
                    onChange={(e) => setRetention(e.currentTarget.value)}
                />
                <span className="text-sm text-text-muted">days</span>
            </SettingsRow>
            <SettingsRow
                title="Archive before pruning"
                description="Export pruned entries to an owner-only file on disk before deleting them, so the trail is kept."
            >
                <Switch
                    aria-label="Archive pruned audit entries to disk"
                    checked={archive}
                    onCheckedChange={setArchive}
                />
            </SettingsRow>
            {(retentionEdit !== null ||
                archiveEdit !== null ||
                savedRetention) && (
                <div className="flex items-center justify-end gap-3">
                    {savedRetention && (
                        <span className="text-sm text-text-muted">Saved</span>
                    )}
                    {(retentionEdit !== null || archiveEdit !== null) && (
                        <Button
                            variant="solid"
                            disabled={update.isPending}
                            onClick={() => void handleSaveRetention()}
                        >
                            Save
                        </Button>
                    )}
                </div>
            )}
            {isOwner && (
                <SettingsRow
                    title="Prune now"
                    description={
                        retentionOff
                            ? "Set a retention window above to enable pruning."
                            : "Immediately delete entries older than the retention window. This cannot be undone."
                    }
                >
                    <Button
                        variant="danger"
                        disabled={retentionOff || prune.isPending}
                        onClick={() => setConfirmPrune(true)}
                    >
                        Prune now
                    </Button>
                </SettingsRow>
            )}
            {pruneMsg && <Notice tone="positive" title={pruneMsg} />}
            {error && <Notice tone="danger" title={error} />}

            <Separator />
            <div>
                <h3 className="mb-3 text-md font-semibold text-text">
                    Recent activity
                </h3>
                {entriesQuery.isLoading ? (
                    <Spinner label="Loading the audit log" />
                ) : entries.length === 0 ? (
                    <p className="text-base text-text-muted">
                        No activity recorded yet.
                    </p>
                ) : (
                    <>
                        <ul className="flex flex-col divide-y divide-border">
                            {entries.map((entry) => (
                                <AuditEntryRow
                                    key={entry.id}
                                    entry={entry}
                                    formatDate={fmt}
                                />
                            ))}
                        </ul>
                        {hasMore && (
                            <div className="mt-3 flex justify-center">
                                <Button
                                    variant="ghost"
                                    disabled={entriesQuery.isFetching}
                                    onClick={() =>
                                        setLimit((l) =>
                                            Math.min(l + PAGE_SIZE, MAX_ENTRIES)
                                        )
                                    }
                                >
                                    Load more
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </div>

            <ConfirmDialog
                open={confirmPrune}
                onOpenChange={setConfirmPrune}
                title="Prune audit log?"
                description={`This permanently deletes audit entries older than ${retention} days. It cannot be undone.`}
                tone="danger"
                confirm={{
                    label: "Prune",
                    onClick: () => void handlePrune(),
                    pending: prune.isPending,
                }}
            />
        </SettingsSection>
    );
};
