import { trpc } from "@/trpc";
import type { Account } from "../../../../server/db/schema";
import { useState } from "react";
import type { OwnerOption } from "@/features/accounts/model";
import {
    Alert,
    Button,
    Group,
    Modal,
    SegmentedControl,
    Select,
    Stack,
    TextInput,
} from "@mantine/core";
import { SUBTYPES } from "@/features/accounts/util";

export interface AccountModalProps {
    opened: boolean;
    onClose: () => void;
    account: Account | null;
    owners: OwnerOption[];
    defaultKind: "asset" | "liability";
}

export const AccountModal = ({
    opened,
    onClose,
    account,
    owners,
    defaultKind,
}: AccountModalProps) => {
    const utils = trpc.useUtils();
    const create = trpc.accounts.create.useMutation();
    const update = trpc.accounts.update.useMutation();
    const isEditing = account !== null;

    const [name, setName] = useState(account?.name ?? "");
    const [kind, setKind] = useState<"asset" | "liability">(
        (account?.kind as "asset" | "liability") ?? defaultKind
    );
    const [subtype, setSubtype] = useState<string | null>(
        account?.subtype ?? null
    );
    const [ownerId, setOwnerId] = useState<string | null>(
        account?.ownerId ?? owners[0]?.value ?? null
    );
    const [institution, setInstitution] = useState(account?.institution ?? "");
    const [note, setNote] = useState(account?.note ?? "");
    const [error, setError] = useState("");

    async function handleSubmit() {
        if (!name.trim()) return setError("Give the account a name.");
        if (!ownerId) return setError("Choose an owner.");
        setError("");
        const payload = {
            name: name.trim(),
            kind,
            subtype: subtype ?? null,
            institution: institution.trim() || null,
            note: note.trim() || null,
        };
        if (isEditing)
            await update.mutateAsync({
                id: account.id,
                expectedUpdatedAt: account.updatedAt,
                ownerId,
                ...payload,
            });
        else await create.mutateAsync({ ownerId, ...payload });
        await Promise.all([
            utils.accounts.list.invalidate(),
            utils.accounts.summary.invalidate(),
        ]);
        onClose();
    }

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={isEditing ? "Edit account" : "Add account"}
            size="md"
        >
            <Stack
                gap="sm"
                onKeyDown={(e) => {
                    if (
                        e.key === "Enter" &&
                        (e.target as HTMLElement).tagName !== "TEXTAREA"
                    ) {
                        e.preventDefault();
                        void handleSubmit();
                    }
                }}
            >
                <TextInput
                    label="Name"
                    placeholder="e.g. Barclays mortgage"
                    data-autofocus
                    value={name}
                    onChange={(e) => setName(e.currentTarget.value)}
                />
                <SegmentedControl
                    value={kind}
                    onChange={(v) => {
                        setKind(v as "asset" | "liability");
                        setSubtype(null);
                    }}
                    data={[
                        { value: "asset", label: "Asset" },
                        { value: "liability", label: "Liability" },
                    ]}
                />
                <Select
                    label="Type"
                    placeholder="Choose a type"
                    value={subtype}
                    onChange={setSubtype}
                    data={SUBTYPES[kind]}
                    clearable
                />
                <Select
                    label="Owner"
                    value={ownerId}
                    onChange={setOwnerId}
                    data={owners}
                    allowDeselect={false}
                />
                <TextInput
                    label="Institution (optional)"
                    placeholder="e.g. Vanguard"
                    value={institution}
                    onChange={(e) => setInstitution(e.currentTarget.value)}
                />
                <TextInput
                    label="Note (optional)"
                    value={note}
                    onChange={(e) => setNote(e.currentTarget.value)}
                />
                {(error || create.error || update.error) && (
                    <Alert color="red" title="Error">
                        {error ||
                            create.error?.message ||
                            update.error?.message}
                    </Alert>
                )}
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => void handleSubmit()}
                        loading={create.isPending || update.isPending}
                    >
                        {isEditing ? "Save" : "Add account"}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
