import { groupedPotOptions } from "@/potOptions";
import { trpc } from "@/trpc";
import { Combobox } from "@/components/ui/Combobox";
import type { Member, Pot, Spend } from "../model";

export interface AssignPotProps {
    spend: Spend;
    pots: Pot[];
    members: Member[];
}

/** Gives a spend its pot right from the list, for clearing a run of them. */
export const AssignPot = ({ spend, pots, members }: AssignPotProps) => {
    const utils = trpc.useUtils();
    const update = trpc.spends.update.useMutation();

    const assign = async (potId: string | null) => {
        if (!potId) return;
        await update.mutateAsync({
            id: spend.id,
            expectedUpdatedAt: spend.updatedAt,
            potId,
        });
        await Promise.all([
            utils.spends.list.invalidate(),
            utils.reconcile.backlog.invalidate(),
        ]);
    };

    return (
        <Combobox
            label={`Pot for ${spend.description}`}
            hideLabel
            placeholder="Assign pot"
            options={groupedPotOptions(pots, members)}
            value={null}
            disabled={update.isPending}
            onChange={(potId) => void assign(potId)}
            className="w-32 shrink-0 sm:w-40"
        />
    );
};
