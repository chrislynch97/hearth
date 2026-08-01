import { useState } from "react";
import {
    Alert,
    Box,
    Button,
    Card,
    Divider,
    Group,
    List,
    Modal,
    Stack,
    Text,
    TextInput,
    Title,
} from "@mantine/core";
import { trpc } from "@/trpc";
import { downloadJson } from "@/csv";

/** A filename-safe form of the household name, so the download says whose data
 *  it is. Falls back to "household" for a name with nothing usable in it. */
const slug = (name: string) =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "household";

/** Settings → Household → Your data: the household owner's own portability and
 *  erasure controls (#228) — the in-app route for a GDPR access, portability or
 *  erasure request, documented in docs/legal/data-rights.md.
 *
 *  Deliberately separate from the instance-wide tools in System settings, which
 *  read and wipe *every* household and belong to the instance owner alone. */
export const HouseholdDataSection = () => {
    const utils = trpc.useUtils();
    const me = trpc.users.me.useQuery();
    const ctx = trpc.bootstrap.context.useQuery();
    const eraseMut = trpc.data.eraseHousehold.useMutation();

    // Owner-only, matching what the procedures enforce: an admin may manage the
    // household's data but not take it out of the instance or destroy it.
    const isOwner = me.data?.role === "owner";
    const retention = trpc.data.backupRetention.useQuery(undefined, {
        enabled: isOwner,
    });

    const [confirmErase, setConfirmErase] = useState(false);
    const [typed, setTyped] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    if (!isOwner) return null;

    const name = ctx.data?.household?.displayName ?? "";
    const isPrimary = me.data?.isPrimaryHousehold ?? false;
    const elsewhere = (me.data?.memberships ?? []).filter(
        (m) => m.householdId !== me.data?.activeHouseholdId
    );
    const backupsOn = (ctx.data?.household?.backupFrequency ?? "off") !== "off";
    const keep = retention.data?.keep;
    // The retention window goes in the privacy policy too, so never invent it:
    // without a number from the server, say the caveat without one.
    const backupNote = !backupsOn
        ? "Automatic backups are off for this household, so no copy is kept — but any backup file you downloaded yourself still holds one."
        : keep
          ? `Backups already taken still contain a copy until they roll off: the most recent ${keep} snapshots are kept.`
          : "Backups already taken still contain a copy until they roll off.";

    const handleExport = async () => {
        setError("");
        setMessage("");
        try {
            const data = await utils.data.exportHousehold.fetch();
            const stamp = new Date().toISOString().slice(0, 10);
            downloadJson(`hearth-${slug(name)}-${stamp}.json`, data);
            setMessage("Downloaded. Keep the file somewhere safe.");
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Couldn't export your data."
            );
        }
    };

    const handleErase = async () => {
        setError("");
        try {
            await eraseMut.mutateAsync();
        } catch (e) {
            setConfirmErase(false);
            setError(
                e instanceof Error
                    ? e.message
                    : "Couldn't delete this household."
            );
            return;
        }
        // Every cached query on this screen belongs to a household that no longer
        // exists, so reload rather than invalidate: the app re-bootstraps against
        // whatever the session has left — another household, or the sign-in screen.
        window.location.href = "/";
    };

    return (
        <Card withBorder padding="md" radius="md">
            <Title order={4} mb="sm">
                Your data
            </Title>
            <Stack gap="sm">
                <Group justify="space-between" align="flex-start">
                    <Box flex={1} miw={260}>
                        <Text size="sm" fw={500}>
                            Export this household
                        </Text>
                        <Text size="xs" c="dimmed">
                            Everything this household holds — members, pots,
                            outgoings, spending, payslips, raises and accounts,
                            plus the list of people with access — as one JSON
                            file. Passwords and two-factor secrets are left out.
                            The file is unencrypted, so store it as carefully as
                            you would a bank statement.
                        </Text>
                    </Box>
                    <Button
                        variant="default"
                        onClick={() => void handleExport()}
                    >
                        Download my data
                    </Button>
                </Group>
                <Divider />
                <Group justify="space-between" align="flex-start">
                    <Box flex={1} miw={260}>
                        <Text
                            size="sm"
                            fw={500}
                            c={isPrimary ? undefined : "red"}
                        >
                            Delete this household
                        </Text>
                        <Text size="xs" c="dimmed">
                            {isPrimary
                                ? "This is the instance's primary household, so it can't be deleted here — deleting it would take the instance with it. Use Reset all data under Settings → System instead."
                                : "Permanently erase this household and everything in it. This cannot be undone."}
                        </Text>
                    </Box>
                    <Button
                        color="red"
                        variant="light"
                        disabled={isPrimary}
                        onClick={() => {
                            setTyped("");
                            setConfirmErase(true);
                        }}
                    >
                        Delete
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
                opened={confirmErase}
                onClose={() => setConfirmErase(false)}
                title={`Delete ${name}?`}
                size="md"
            >
                <Stack gap="md">
                    <Text size="sm">This permanently deletes:</Text>
                    <List size="sm" spacing={4}>
                        <List.Item>
                            every member, pot, outgoing, spend, payslip, raise
                            and account in {name}
                        </List.Item>
                        <List.Item>
                            everyone&apos;s access to it, and any pending
                            invitations
                        </List.Item>
                        <List.Item>this household&apos;s audit trail</List.Item>
                    </List>
                    <Text size="sm">
                        {elsewhere.length > 0
                            ? `You'll be switched to ${elsewhere[0]?.householdName}. `
                            : "You'll be signed out — this is your only household. "}
                        {backupNote}
                    </Text>
                    <Text size="sm">
                        Download your data first if you want to keep it.
                    </Text>
                    <TextInput
                        label={`Type ${name} to confirm`}
                        value={typed}
                        onChange={(e) => setTyped(e.currentTarget.value)}
                        autoComplete="off"
                    />
                    <Group justify="flex-end">
                        <Button
                            variant="default"
                            onClick={() => setConfirmErase(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            color="red"
                            disabled={!name || typed.trim() !== name}
                            loading={eraseMut.isPending}
                            onClick={() => void handleErase()}
                        >
                            Delete this household
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Card>
    );
};
