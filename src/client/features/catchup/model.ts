import { toMinor } from "@shared/money";
import { PART_PAY_NOTE } from "@shared/reconcile";

export interface BacklogSpend {
    id: string;
    date: string;
    description: string;
    amount: number;
    ownerId: string;
}

export interface BacklogPayer {
    ownerId: string;
    total: number;
    count: number;
    residual: number;
    spends: BacklogSpend[];
}

export interface BacklogPot {
    potId: string;
    potName: string;
    ownerId: string;
    total: number;
    count: number;
    residual: number;
    payers: BacklogPayer[];
}

export interface Settlement {
    /** Signed minor units still to move: spends plus any residual carried from earlier part-moves. */
    required: number;
    /** Sign to apply to the magnitude the user types, so the mutation writes the right way round. */
    direction: 1 | -1;
    /** Money owed back into the pot rather than out of it. */
    isPullBack: boolean;
    /** False for a residual-only row, where the only action is to write it off. */
    hasSpends: boolean;
}

export const settlement = (payer: BacklogPayer): Settlement => {
    const required = payer.total + payer.residual;

    return {
        required,
        direction: required < 0 ? -1 : 1,
        isPullBack: required < 0,
        hasSpends: payer.count > 0,
    };
};

/** One transfer to make: a single payer's share of a single pot. */
export interface Transfer {
    key: string;
    potId: string;
    potName: string;
    payer: BacklogPayer;
    required: number;
}

/** How many transfers are outstanding and what they add up to. Spends with no
 *  pot aren't in it: they can't move until they have one. */
export const backlogToMove = (
    pots: Array<Pick<BacklogPot, "payers">>
): { transfers: number; total: number } => {
    const payers = pots.flatMap((pot) => pot.payers);
    return {
        transfers: payers.length,
        total: payers.reduce((sum, p) => sum + settlement(p).required, 0),
    };
};

/** Everything going to one person, which is how the transfers get made. */
export interface TransferSection {
    ownerId: string;
    name: string;
    total: number;
    transfers: Transfer[];
}

/** The backlog re-cut from pots to people, biggest first. */
export const transferSections = (
    pots: BacklogPot[],
    members: Array<{ id: string; displayName: string }>
): TransferSection[] => {
    const sections = new Map<string, TransferSection>();
    for (const pot of pots) {
        for (const payer of pot.payers) {
            const { required } = settlement(payer);
            const section = sections.get(payer.ownerId) ?? {
                ownerId: payer.ownerId,
                name:
                    members.find((m) => m.id === payer.ownerId)?.displayName ??
                    "Someone",
                total: 0,
                transfers: [],
            };
            section.total += required;
            section.transfers.push({
                // Keyed by what is outstanding: once a part-move lands, the row
                // is a different ask and shouldn't keep its old state.
                key: `${pot.potId}:${payer.ownerId}:${payer.total}:${payer.residual}`,
                potId: pot.potId,
                potName: pot.potName,
                payer,
                required,
            });
            sections.set(payer.ownerId, section);
        }
    }
    return [...sections.values()]
        .map((section) => ({
            ...section,
            transfers: section.transfers.sort(
                (a, b) => Math.abs(b.required) - Math.abs(a.required)
            ),
        }))
        .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
};
/** Parse the amount field (which holds a magnitude) into minor units; blank or unparseable is 0. */
export const parseMoved = (
    moved: number | string,
    decimalPlaces: number
): number => {
    const major = Number(moved);

    return moved === "" || Number.isNaN(major)
        ? 0
        : toMinor(major, decimalPlaces);
};

/** Moving more than needed is allowed — the excess carries forward as a credit — but is worth flagging. */
export const isOvershoot = (movedMinor: number, required: number): boolean =>
    movedMinor > Math.abs(required);

/** The fields of a reconciliation batch the history list reads. */
export interface HistoryBatch {
    totalAmount: number;
    movedAmount: number | null;
    transactionCount: number;
    reversedAt: Date | null;
    /** What tells a written-off residual from one that was paid down. */
    note: string | null;
}

export interface BatchSummary {
    isReversed: boolean;
    /** No spends: a residual written off rather than money moved. */
    isWriteOff: boolean;
    /** No spends either, but the money really moved — a residual paid down. */
    isResidualPayment: boolean;
    /** Less (or more) left the account than was required; the gap is the residual it created or cleared. */
    isPartial: boolean;
}

export const batchSummary = (batch: HistoryBatch): BatchSummary => {
    // Both zero-spend kinds carry the amount in movedAmount against a zero
    // total, so only the note separates them; anything older has no note and is
    // a write-off, which is all that existed then.
    const noSpends = batch.transactionCount === 0;
    const isResidualPayment = noSpends && batch.note === PART_PAY_NOTE;

    return {
        isReversed: batch.reversedAt !== null,
        isWriteOff: noSpends && !isResidualPayment,
        isResidualPayment,
        isPartial:
            !noSpends &&
            batch.movedAmount !== null &&
            batch.movedAmount !== batch.totalAmount,
    };
};
