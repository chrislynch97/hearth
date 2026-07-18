import type { Pot, SpendTransaction } from "../../../../server/db/schema";
import { trpc } from "@/trpc";
import { useState } from "react";
import { Select } from "@mantine/core";

export interface AssignPotCellProps {
    spend: SpendTransaction;
    pots: Pot[];
}

export const AssignPotCell = ({ spend, pots }: AssignPotCellProps) => {
    const utils = trpc.useUtils();
    const update = trpc.spends.update.useMutation();
    const [value, setValue] = useState<string>("");

    async function handleSave(v: string | null) {
        setValue(v ?? "");
        if (!v) return;
        await update.mutateAsync({
            id: spend.id,
            expectedUpdatedAt: spend.updatedAt,
            potId: v,
        });
        await Promise.all([
            utils.spends.list.invalidate(),
            utils.reconcile.backlog.invalidate(),
        ]);
    }

    return (
        <Select
            size="xs"
            placeholder="Assign a pot"
            data={pots.map((p) => ({ value: p.id, label: p.name }))}
            value={value || null}
            searchable
            onChange={(v) => void handleSave(v)}
            disabled={update.isPending}
            w={180}
        />
    );
};
