import { useEffect, useState } from "react";
import {
    Alert,
    Badge,
    Button,
    Card,
    Divider,
    Group,
    Loader,
    Modal,
    NumberInput,
    Stack,
    Text,
    Title,
} from "@mantine/core";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/trpc";
import { useFormatDate } from "@/useMoney";
import type { AppRouter } from "../../server/trpc/router";

type AuditEntry = inferRouterOutputs<AppRouter>["audit"]["list"][number];

// The parsed `changes` payload the mutation layer writes (trpc/audit.ts). Dates
// inside the snapshots/diffs arrive as ISO strings (JSON round-trip), not Date
// objects — only the row's top-level `createdAt` is a real Date.
type Snapshot = Record<string, unknown>;
type FieldDiff = Record<string, { before: unknown; after: unknown }>;
type Changes =
    | { kind: "create"; after: Snapshot }
    | { kind: "archive"; before: Snapshot }
    | { kind: "delete"; before: Snapshot }
    | { kind: "update"; fields: FieldDiff }
    | null;

// How many entries to show at first, and how much each "Load more" reveals. The
// backend caps `list` at 500, so paging stops there.
const PAGE_SIZE = 25;
const MAX_ENTRIES = 500;

// Per-action badge styling for the viewer.
const ACTION_META: Record<string, { color: string; label: string }> = {
    create: { color: "moss", label: "Created" },
    update: { color: "blue", label: "Updated" },
    archive: { color: "gray", label: "Archived" },
    delete: { color: "red", label: "Deleted" },
};

/** camelCase entity type → a human "Income source" label. */
const entityLabel = (entityType: string): string => {
    const spaced = entityType
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ");
    return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
};

/** A single stored value rendered readably: blanks, booleans and objects all get
 *  a sensible shape rather than a bare `null`/`[object Object]`. */
const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return "—";
    if (value === "") return "(empty)";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
};

/** The readable body of one audit entry: a field-by-field diff for updates, and
 *  an expandable snapshot for create/archive/delete. */
const ChangeDetail = ({ changes }: { changes: Changes }) => {
    const [open, setOpen] = useState(false);

    if (!changes) {
        return (
            <Text size="xs" c="dimmed">
                No details recorded.
            </Text>
        );
    }

    if (changes.kind === "update") {
        const fields = Object.entries(changes.fields);
        if (fields.length === 0) {
            return (
                <Text size="xs" c="dimmed">
                    No fields changed.
                </Text>
            );
        }
        return (
            <Stack gap={2}>
                {fields.map(([field, { before, after }]) => (
                    <Text key={field} size="xs">
                        <Text span fw={500}>
                            {entityLabel(field)}:
                        </Text>{" "}
                        <Text span c="dimmed" ff="monospace">
                            {formatValue(before)}
                        </Text>{" "}
                        →{" "}
                        <Text span ff="monospace">
                            {formatValue(after)}
                        </Text>
                    </Text>
                ))}
            </Stack>
        );
    }

    // create / archive / delete: a whole-row snapshot, collapsed by default since
    // it can be wide.
    const snapshot = changes.kind === "create" ? changes.after : changes.before;
    const entries = Object.entries(snapshot);
    return (
        <Stack gap={2}>
            <Button
                variant="subtle"
                size="compact-xs"
                px={0}
                onClick={() => setOpen((o) => !o)}
                style={{ alignSelf: "flex-start" }}
            >
                {open
                    ? "Hide details"
                    : `Show details (${entries.length} fields)`}
            </Button>
            {open &&
                entries.map(([field, value]) => (
                    <Text key={field} size="xs">
                        <Text span fw={500}>
                            {entityLabel(field)}:
                        </Text>{" "}
                        <Text span ff="monospace">
                            {formatValue(value)}
                        </Text>
                    </Text>
                ))}
        </Stack>
    );
};

/** One row in the viewer: who, when, what action on which entity, and the change
 *  detail. */
const AuditRow = ({
    entry,
    fmt,
}: {
    entry: AuditEntry;
    fmt: (date: string) => string;
}) => {
    const meta = ACTION_META[entry.action] ?? {
        color: "gray",
        label: entry.action,
    };
    const when = entry.createdAt;
    const day = fmt(when.toLocaleDateString("en-CA"));
    return (
        <Card withBorder padding="xs" radius="sm">
            <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Group gap="xs" wrap="nowrap">
                    <Badge color={meta.color} variant="light" size="sm">
                        {meta.label}
                    </Badge>
                    <Text size="sm" fw={500}>
                        {entityLabel(entry.entityType)}
                    </Text>
                </Group>
                <Text size="xs" c="dimmed" ta="right" style={{ flexShrink: 0 }}>
                    {day} {when.toLocaleTimeString()}
                </Text>
            </Group>
            <Text size="xs" c="dimmed" mt={2} mb={4}>
                by {entry.actorLabel ?? "Unknown"}
            </Text>
            <ChangeDetail changes={entry.changes as Changes} />
        </Card>
    );
};

/** Household audit trail (issues #35/#41): a viewer of who-changed-what plus the
 *  retention window and manual prune. Reads are admin-gated and pruning is
 *  owner-gated, so the whole card only renders for admins and the prune controls
 *  only for the owner (the server enforces both regardless). */
export const AuditLogSection = () => {
    const utils = trpc.useUtils();
    const fmt = useFormatDate();
    const me = trpc.users.me.useQuery();
    const ctx = trpc.bootstrap.context.useQuery();

    const role = me.data?.role ?? null;
    const isAdmin = role === "admin" || role === "owner";
    const isOwner = role === "owner";

    const hh = ctx.data?.household;

    const [limit, setLimit] = useState(PAGE_SIZE);
    const entriesQuery = trpc.audit.list.useQuery(
        { limit },
        { enabled: isAdmin }
    );
    const entries = entriesQuery.data ?? [];
    const hasMore = entries.length >= limit && limit < MAX_ENTRIES;

    // Retention window, seeded from the household once it loads (null keeps the
    // NumberInput from flashing 0 over a real value).
    const update = trpc.household.update.useMutation();
    const [retention, setRetention] = useState<number | string | null>(null);
    const [savedRetention, setSavedRetention] = useState(false);

    useEffect(() => {
        if (hh) setRetention((prev) => prev ?? hh.auditRetentionDays);
    }, [hh]);

    const prune = trpc.audit.prune.useMutation();
    const [confirmPrune, setConfirmPrune] = useState(false);
    const [pruneMsg, setPruneMsg] = useState("");
    const [error, setError] = useState("");

    if (!isAdmin) return null;

    const handleSaveRetention = async () => {
        setError("");
        try {
            await update.mutateAsync({ auditRetentionDays: Number(retention) });
            // The save itself is an audited household edit, so refresh the viewer
            // alongside the household (which feeds the retention field).
            await Promise.all([
                utils.bootstrap.context.invalidate(),
                utils.audit.list.invalidate(),
            ]);
            setSavedRetention(true);
            setTimeout(() => setSavedRetention(false), 2000);
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
                      )}.`
            );
        } catch (e) {
            setError(
                e instanceof Error
                    ? e.message
                    : "Could not prune the audit log."
            );
        }
    };

    const retentionOff = Number(retention) === 0;

    return (
        <Card withBorder padding="md" radius="md">
            <Title order={4} mb="sm">
                Audit log
            </Title>
            <Text size="xs" c="dimmed" mb="sm">
                A record of who created, changed, archived or deleted household
                data. Visible to admins.
            </Text>

            {/* Retention window + manual prune. */}
            <Group justify="space-between" align="flex-end">
                <div>
                    <Text size="sm" fw={500}>
                        Keep history for
                    </Text>
                    <Text size="xs" c="dimmed">
                        Entries older than this are pruned automatically. 0
                        keeps everything forever.
                    </Text>
                </div>
                <Group gap="sm" align="flex-end">
                    <NumberInput
                        aria-label="Audit retention days"
                        size="xs"
                        w={130}
                        min={0}
                        max={3650}
                        suffix=" days"
                        value={retention ?? ""}
                        onChange={setRetention}
                    />
                    <Button
                        size="xs"
                        variant="default"
                        loading={update.isPending}
                        onClick={() => void handleSaveRetention()}
                    >
                        Save
                    </Button>
                    {savedRetention && (
                        <Text size="xs" c="dimmed">
                            Saved ✓
                        </Text>
                    )}
                </Group>
            </Group>

            {isOwner && (
                <>
                    <Divider my="sm" />
                    <Group justify="space-between" align="center">
                        <div>
                            <Text size="sm" fw={500}>
                                Prune now
                            </Text>
                            <Text size="xs" c="dimmed">
                                Immediately delete entries older than the
                                retention window. This cannot be undone.
                            </Text>
                        </div>
                        <Button
                            size="xs"
                            variant="light"
                            color="red"
                            disabled={retentionOff}
                            loading={prune.isPending}
                            onClick={() => setConfirmPrune(true)}
                        >
                            Prune now
                        </Button>
                    </Group>
                    {retentionOff && (
                        <Text size="xs" c="dimmed" mt={4}>
                            Set a retention window above to enable pruning.
                        </Text>
                    )}
                </>
            )}

            {pruneMsg && (
                <Alert
                    color="moss"
                    variant="light"
                    mt="sm"
                    withCloseButton
                    onClose={() => setPruneMsg("")}
                >
                    {pruneMsg}
                </Alert>
            )}
            {error && (
                <Alert color="red" title="Error" mt="sm">
                    {error}
                </Alert>
            )}

            <Divider my="sm" label="Recent activity" labelPosition="left" />

            {/* Viewer. */}
            {entriesQuery.isLoading ? (
                <Loader size="sm" />
            ) : entries.length === 0 ? (
                <Text size="sm" c="dimmed">
                    No activity recorded yet.
                </Text>
            ) : (
                <Stack gap="xs">
                    {entries.map((entry) => (
                        <AuditRow key={entry.id} entry={entry} fmt={fmt} />
                    ))}
                    {hasMore && (
                        <Group justify="center">
                            <Button
                                variant="subtle"
                                size="xs"
                                loading={entriesQuery.isFetching}
                                onClick={() =>
                                    setLimit((l) =>
                                        Math.min(l + PAGE_SIZE, MAX_ENTRIES)
                                    )
                                }
                            >
                                Load more
                            </Button>
                        </Group>
                    )}
                </Stack>
            )}

            <Modal
                opened={confirmPrune}
                onClose={() => setConfirmPrune(false)}
                title="Prune audit log?"
                size="sm"
            >
                <Stack gap="md">
                    <Text size="sm">
                        This permanently deletes audit entries older than{" "}
                        {String(retention)} days. It cannot be undone.
                    </Text>
                    <Group justify="flex-end">
                        <Button
                            variant="default"
                            onClick={() => setConfirmPrune(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            color="red"
                            loading={prune.isPending}
                            onClick={() => void handlePrune()}
                        >
                            Prune
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Card>
    );
};
