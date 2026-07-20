import { describe, it, expect } from "vitest";
import type { BacklogPayer, HistoryBatch } from "./model";
import { batchSummary, isOvershoot, parseMoved, settlement } from "./model";

const payer = (over: Partial<BacklogPayer> = {}): BacklogPayer => ({
    ownerId: "ava",
    total: 0,
    count: 0,
    residual: 0,
    spends: [],
    ...over,
});

describe("settlement", () => {
    it("owes out when the total is positive", () => {
        const s = settlement(payer({ total: 2500, count: 3 }));
        expect(s).toEqual({
            required: 2500,
            direction: 1,
            isPullBack: false,
            hasSpends: true,
        });
    });

    it("pulls back when the total is negative", () => {
        const s = settlement(payer({ total: -2500, count: 1 }));
        expect(s).toEqual({
            required: -2500,
            direction: -1,
            isPullBack: true,
            hasSpends: true,
        });
    });

    // Zero is not a pull-back: nothing to move, and the sign must stay positive
    // so a magnitude typed over the top is still written as money going out.
    it("treats exactly zero as owed out, not pulled back", () => {
        const s = settlement(payer({ total: 2500, residual: -2500, count: 2 }));
        expect(s.required).toBe(0);
        expect(s.direction).toBe(1);
        expect(s.isPullBack).toBe(false);
    });

    it("adds the residual carried from earlier part-moves", () => {
        expect(settlement(payer({ total: 2000, residual: 500 })).required).toBe(
            2500
        );
        expect(
            settlement(payer({ total: 2000, residual: -500 })).required
        ).toBe(1500);
    });

    // A credit bigger than this round's spends reverses the direction of the
    // whole row — the payer is owed money back rather than owing it.
    it("lets the residual flip the sign of the total", () => {
        const s = settlement(payer({ total: 1000, residual: -1500, count: 2 }));
        expect(s.required).toBe(-500);
        expect(s.direction).toBe(-1);
        expect(s.isPullBack).toBe(true);
    });

    it("has no spends when the count is zero, whatever the residual", () => {
        expect(settlement(payer({ residual: 750 })).hasSpends).toBe(false);
        expect(settlement(payer({ residual: -750 })).hasSpends).toBe(false);
        expect(settlement(payer({ residual: 750 })).required).toBe(750);
    });
});

describe("parseMoved", () => {
    it("converts a major-unit amount to minor units", () => {
        expect(parseMoved(25, 2)).toBe(2500);
        expect(parseMoved(25.5, 2)).toBe(2550);
        expect(parseMoved("25.50", 2)).toBe(2550);
    });

    it("honours the currency's decimal places", () => {
        expect(parseMoved(25, 0)).toBe(25);
        expect(parseMoved(25.5, 3)).toBe(25500);
    });

    it("is 0 for a blank field", () => {
        expect(parseMoved("", 2)).toBe(0);
    });

    // NumberInput can hand back a partial entry like "-" or "."; those must not
    // reach the mutation as NaN.
    it("is 0 for an unparseable entry", () => {
        expect(parseMoved("-", 2)).toBe(0);
        expect(parseMoved("abc", 2)).toBe(0);
    });
});

describe("isOvershoot", () => {
    it("is false at exactly the required amount", () => {
        expect(isOvershoot(2500, 2500)).toBe(false);
    });

    it("is false just below", () => {
        expect(isOvershoot(2499, 2500)).toBe(false);
    });

    it("is true just above", () => {
        expect(isOvershoot(2501, 2500)).toBe(true);
    });

    // The field holds a magnitude, so a pull-back overshoots against |required|.
    it("compares against the magnitude when pulling back", () => {
        expect(isOvershoot(2500, -2500)).toBe(false);
        expect(isOvershoot(2501, -2500)).toBe(true);
    });

    it("treats anything over zero as an overshoot when nothing is required", () => {
        expect(isOvershoot(0, 0)).toBe(false);
        expect(isOvershoot(1, 0)).toBe(true);
    });
});

const batch = (over: Partial<HistoryBatch> = {}): HistoryBatch => ({
    totalAmount: 2500,
    movedAmount: null,
    transactionCount: 3,
    reversedAt: null,
    ...over,
});

describe("batchSummary", () => {
    // Null movedAmount is the server's "moved in full" marker, not a partial move.
    it("is a plain full move when movedAmount is null", () => {
        expect(batchSummary(batch())).toEqual({
            isReversed: false,
            isWriteOff: false,
            isPartial: false,
        });
    });

    it("is not partial when the amount moved matches what was required", () => {
        expect(batchSummary(batch({ movedAmount: 2500 })).isPartial).toBe(
            false
        );
    });

    it("is partial when less left the account than was required", () => {
        expect(batchSummary(batch({ movedAmount: 2000 })).isPartial).toBe(true);
    });

    it("is partial when more left the account than was required", () => {
        expect(batchSummary(batch({ movedAmount: 3000 })).isPartial).toBe(true);
    });

    // A write-off has no spends, so totalAmount is 0 and movedAmount carries the
    // residual cleared — that mismatch must not read as a part-move.
    it("is a write-off, not a part-move, when there are no transactions", () => {
        const s = batchSummary(
            batch({ totalAmount: 0, movedAmount: 750, transactionCount: 0 })
        );
        expect(s.isWriteOff).toBe(true);
        expect(s.isPartial).toBe(false);
    });

    it("flags a reversed batch", () => {
        expect(
            batchSummary(batch({ reversedAt: new Date("2026-03-20") }))
                .isReversed
        ).toBe(true);
    });
});
