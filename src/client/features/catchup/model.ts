import { toMinor } from "@shared/money";

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
}

export interface BatchSummary {
    isReversed: boolean;
    /** No spends: a residual written off rather than money moved. */
    isWriteOff: boolean;
    /** Less (or more) left the account than was required; the gap is the residual it created or cleared. */
    isPartial: boolean;
}

export const batchSummary = (batch: HistoryBatch): BatchSummary => {
    const isWriteOff = batch.transactionCount === 0;

    return {
        isReversed: batch.reversedAt !== null,
        isWriteOff,
        isPartial:
            !isWriteOff &&
            batch.movedAmount !== null &&
            batch.movedAmount !== batch.totalAmount,
    };
};
