import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { IncomeSource } from "../model";

// Stable spies shared with the mocked trpc module (vi.mock is hoisted).
const mocks = vi.hoisted(() => ({
    createMutate: vi.fn().mockResolvedValue({}),
    updateMutate: vi.fn().mockResolvedValue({}),
    archiveMutate: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/trpc", () => {
    const mutation = (mutateAsync: unknown) => ({
        useMutation: () => ({ mutateAsync, isPending: false }),
    });
    return {
        trpc: {
            useUtils: () => ({
                incomeSources: { list: { invalidate: mocks.invalidate } },
                income: { overview: { invalidate: mocks.invalidate } },
            }),
            incomeSources: {
                create: mutation(mocks.createMutate),
                update: mutation(mocks.updateMutate),
                archive: mutation(mocks.archiveMutate),
            },
        },
    };
});

vi.mock("@/useMoney", () => ({
    useMoney: () => ({ decimalPlaces: 2, symbol: "£" }),
}));

// Imported after the mocks are registered.
import { IncomeSourceDialog } from "./IncomeSourceDialog";

const source = {
    id: "s1",
    name: "Dividends",
    amount: 12000,
    recurrence: "quarterly",
    basis: "net",
    updatedAt: new Date(0),
} as unknown as IncomeSource;

const members = [{ id: "m1", displayName: "Ava" }];

beforeEach(() => {
    mocks.createMutate.mockClear();
    mocks.updateMutate.mockClear();
});

describe("IncomeSourceDialog", () => {
    it("won't add a source without knowing whose it is", () => {
        render(
            <IncomeSourceDialog
                source={null}
                members={members}
                onClose={vi.fn()}
            />
        );

        fireEvent.click(screen.getByRole("button", { name: "Add income" }));

        expect(mocks.createMutate).not.toHaveBeenCalled();
        expect(
            screen.getByText("Choose whose income this is.")
        ).toBeInTheDocument();
    });

    it("saves an edit in minor units, and marks it gross when ticked", async () => {
        render(
            <IncomeSourceDialog
                source={source}
                members={members}
                onClose={vi.fn()}
            />
        );

        fireEvent.change(screen.getByLabelText("Amount"), {
            target: { value: "150.50" },
        });
        fireEvent.click(screen.getByRole("checkbox"));
        fireEvent.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() =>
            expect(mocks.updateMutate).toHaveBeenCalledWith({
                id: "s1",
                expectedUpdatedAt: new Date(0),
                name: "Dividends",
                amount: 15050,
                recurrence: "quarterly",
                basis: "gross",
            })
        );
    });
});
