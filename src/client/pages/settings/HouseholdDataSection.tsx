import { useState } from "react";
import { trpc } from "@/trpc";
import { downloadJson } from "@/csv";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Notice } from "@/components/ui/Notice";
import { SettingsRow } from "@/components/ui/SettingsRow";
import { SettingsSection } from "@/components/ui/SettingsSection";
import { TextField } from "@/components/ui/TextField";

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
    // Erasure now takes accounts that belong to nothing else with it (#230), so
    // the dialog has to be able to say how many — and whether one is the
    // reader's own — before they type the household's name.
    const erasure = trpc.data.erasureImpact.useQuery(undefined, {
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

    // An account belonging to no household can't sign in and can't be given one
    // back, so erasure removes those too rather than leaving an email address and
    // a password hash behind (#230).
    const accountsDeleted = erasure.data?.accountsDeleted ?? 0;
    const others = accountsDeleted - (erasure.data?.includesYou ? 1 : 0);
    const accountsNote = erasure.data?.includesYou
        ? others > 0
            ? `your account and ${others} other ${others === 1 ? "account" : "accounts"}, because this is the only household they belong to`
            : "your account, because this is the only household you belong to"
        : `${accountsDeleted} ${accountsDeleted === 1 ? "account" : "accounts"}, because this is the only household they belong to`;

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
        <>
            <SettingsSection
                title="Your data"
                description="Take a copy of everything this household holds."
            >
                <SettingsRow
                    title="Export this household"
                    description="Members, pots, outgoings, spending, payslips, raises and accounts, plus the people with access, as one JSON file. Passwords and two-factor secrets are left out. It's unencrypted, so store it as carefully as a bank statement."
                >
                    <Button onClick={() => void handleExport()}>
                        Download my data
                    </Button>
                </SettingsRow>
                {message && <Notice tone="positive" title={message} />}
                {error && <Notice tone="danger" title={error} />}
            </SettingsSection>

            <SettingsSection
                title="Danger zone"
                description="Things that can't be undone."
                tone="danger"
            >
                <SettingsRow
                    title="Delete this household"
                    danger={!isPrimary}
                    description={
                        isPrimary
                            ? "This is the instance's primary household, so it can't be deleted here — deleting it would take the instance with it. Use Reset all data under Settings → System instead."
                            : "Permanently erase this household and everything in it. This cannot be undone."
                    }
                >
                    {!isPrimary && (
                        <Button
                            variant="danger"
                            onClick={() => {
                                setTyped("");
                                setConfirmErase(true);
                            }}
                        >
                            Delete
                        </Button>
                    )}
                </SettingsRow>
            </SettingsSection>

            <ConfirmDialog
                open={confirmErase}
                onOpenChange={setConfirmErase}
                title={`Delete ${name}?`}
                tone="danger"
                confirm={{
                    label: "Delete this household",
                    onClick: () => void handleErase(),
                    pending: eraseMut.isPending,
                    disabled: !name || typed.trim() !== name,
                }}
            >
                <div>
                    <p>This permanently deletes:</p>
                    <ul className="mt-1.5 list-disc space-y-1 pl-5">
                        <li>
                            every member, pot, outgoing, spend, payslip, raise
                            and account in {name}
                        </li>
                        <li>
                            everyone&apos;s access to it, and any pending
                            invitations
                        </li>
                        <li>this household&apos;s audit trail</li>
                        {accountsDeleted > 0 && <li>{accountsNote}</li>}
                    </ul>
                </div>
                <p className="text-text-secondary">
                    {elsewhere.length > 0
                        ? `You'll be switched to ${elsewhere[0]?.householdName}. `
                        : "You'll be signed out — this is your only household. "}
                    {backupNote} Download your data first if you want to keep
                    it.
                </p>
                <TextField
                    label={`Type ${name} to confirm`}
                    value={typed}
                    onChange={(e) => setTyped(e.currentTarget.value)}
                    autoComplete="off"
                />
            </ConfirmDialog>
        </>
    );
};
