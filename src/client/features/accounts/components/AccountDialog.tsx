import { useState } from "react";
import { trpc } from "@/trpc";
import { Button } from "@/components/ui/Button";
import { ChoiceField } from "@/components/ui/ChoiceField";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Notice } from "@/components/ui/Notice";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TextField } from "@/components/ui/TextField";
import { SUBTYPES } from "../util";
import type { AccountKind, AccountWithValue, OwnerOption } from "../model";

// Radix Select can't hold an empty value, so "no type" needs a stand-in.
const NO_TYPE = "none";

const KINDS: Array<{ value: AccountKind; label: string }> = [
    { value: "asset", label: "Asset" },
    { value: "liability", label: "Liability" },
];

export interface AccountDialogProps {
    /** Null adds a new account. */
    account: AccountWithValue | null;
    owners: OwnerOption[];
    onClose: () => void;
    onDelete: (account: AccountWithValue) => void;
}

/** An account's details. Mounted per open, so the fields always start from the
 *  account as it is now. */
export const AccountDialog = ({
    account,
    owners,
    onClose,
    onDelete,
}: AccountDialogProps) => {
    const utils = trpc.useUtils();
    const create = trpc.accounts.create.useMutation();
    const update = trpc.accounts.update.useMutation();
    const [name, setName] = useState(account?.name ?? "");
    const [kind, setKind] = useState((account?.kind ?? "asset") as AccountKind);
    const [subtype, setSubtype] = useState(account?.subtype ?? NO_TYPE);
    const [ownerId, setOwnerId] = useState(
        account?.ownerId ?? owners[0]?.value ?? null
    );
    const [institution, setInstitution] = useState(account?.institution ?? "");
    const [note, setNote] = useState(account?.note ?? "");
    const [error, setError] = useState("");

    const pending = create.isPending || update.isPending;

    const submit = async () => {
        if (!name.trim()) return setError("Give the account a name.");
        if (!ownerId) return setError("Choose an owner.");
        setError("");
        const fields = {
            name: name.trim(),
            kind,
            subtype: subtype === NO_TYPE ? null : subtype,
            institution: institution.trim() || null,
            note: note.trim() || null,
            ownerId,
        };
        try {
            if (account) {
                await update.mutateAsync({
                    id: account.id,
                    expectedUpdatedAt: account.updatedAt,
                    ...fields,
                });
            } else {
                await create.mutateAsync(fields);
            }
            await Promise.all([
                utils.accounts.list.invalidate(),
                utils.accounts.summary.invalidate(),
            ]);
            onClose();
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Could not save the account."
            );
        }
    };

    return (
        <ConfirmDialog
            open
            onOpenChange={(open) => !open && onClose()}
            title={account ? `Edit ${account.name}` : "Add account"}
            confirm={{
                label: account ? "Save" : "Add account",
                onClick: () => void submit(),
                pending,
            }}
            aside={
                account && (
                    <Button
                        variant="danger-outline"
                        disabled={pending}
                        onClick={() => onDelete(account)}
                    >
                        Delete
                    </Button>
                )
            }
        >
            <TextField
                label="Name"
                placeholder="e.g. Barclays mortgage"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && void submit()}
            />
            <SegmentedControl
                label="Asset or liability"
                options={KINDS}
                value={kind}
                onChange={(next) => {
                    setKind(next);
                    setSubtype(NO_TYPE);
                }}
                className="w-full [&>*]:flex-1"
            />
            <div className="grid gap-4 sm:grid-cols-2">
                <ChoiceField
                    label="Type"
                    options={[
                        { value: NO_TYPE, label: "No type" },
                        ...SUBTYPES[kind],
                    ]}
                    value={subtype}
                    onChange={setSubtype}
                />
                <ChoiceField
                    label="Owner"
                    options={owners}
                    value={ownerId}
                    onChange={setOwnerId}
                />
            </div>
            <TextField
                label="Institution (optional)"
                placeholder="e.g. Vanguard"
                value={institution}
                onChange={(e) => setInstitution(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && void submit()}
            />
            <TextField
                label="Note (optional)"
                value={note}
                onChange={(e) => setNote(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && void submit()}
            />
            {error && <Notice tone="danger" title={error} />}
        </ConfirmDialog>
    );
};
