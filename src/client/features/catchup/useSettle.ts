import { trpc } from "@/trpc";
import { settlement, type BacklogPayer } from "./model";

/** The ways a transfer gets off the list. A payer with spends left marks them
 *  moved; one with only a carried-over residual pays that down instead. */
export const useSettle = () => {
    const utils = trpc.useUtils();
    const markMoved = trpc.reconcile.markPotMoved.useMutation();
    const payResidual = trpc.reconcile.payResidual.useMutation();
    const clearResidual = trpc.reconcile.clearResidual.useMutation();

    const refresh = () =>
        Promise.all([
            utils.reconcile.backlog.invalidate(),
            utils.reconcile.batches.invalidate(),
            utils.spends.list.invalidate(),
        ]);

    /** `magnitude` is what actually moved, unsigned; the direction is the payer's. */
    const move = async (
        potId: string,
        payer: BacklogPayer,
        magnitude: number
    ) => {
        const { direction, hasSpends } = settlement(payer);
        const input = {
            potId,
            ownerId: payer.ownerId,
            movedAmount: direction * magnitude,
        };
        await (hasSpends
            ? markMoved.mutateAsync(input)
            : payResidual.mutateAsync(input));
    };

    const writeOff = async (potId: string, payer: BacklogPayer) => {
        await clearResidual.mutateAsync({ potId, ownerId: payer.ownerId });
        await refresh();
    };

    return {
        move,
        writeOff,
        refresh,
        pending:
            markMoved.isPending ||
            payResidual.isPending ||
            clearResidual.isPending,
        error: markMoved.error ?? payResidual.error ?? clearResidual.error,
    };
};
