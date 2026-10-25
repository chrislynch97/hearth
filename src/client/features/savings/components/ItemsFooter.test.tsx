import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { MoneyFormat } from "@/useMoney";
import type { GoalPlan } from "@/features/savings/model";
import type { SavingsGoal, SavingsItem } from "../../../../server/db/schema";

const mocks = vi.hoisted(() => ({
    update: vi.fn().mockResolvedValue({}),
    invalidate: vi.fn().mockResolvedValue(undefined),
    notify: vi.fn(),
}));

vi.mock("@/trpc", () => ({
    trpc: {
        useUtils: () => ({ savings: { invalidate: mocks.invalidate } }),
        savings: {
            updateGoal: {
                useMutation: () => ({ mutateAsync: mocks.update, isPending: false }),
            },
        },
    },
}));
vi.mock("@/notify", () => ({ notifySuccess: mocks.notify }));

// Imported after the mocks are registered.
import { ItemsFooter } from "./ItemsFooter";

const money: MoneyFormat = {
    symbol: "£",
    decimalPlaces: 2,
    locale: "en-GB",
    symbolPosition: "prefix",
    groupSeparator: ",",
    decimalSeparator: ".",
};

const now = new Date("2026-10-24");

const goal = (targetAmount: number | null): SavingsGoal => ({
    id: "g",
    householdId: "household",
    potId: "p",
    shortId: "k3x9p2",
    name: "Kitchen",
    targetAmount,
    targetDate: targetAmount === null ? null : "2027-10-24",
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
});

const item = (amount: number, paidOn: string | null = null): SavingsItem => ({
    id: `i${amount}`,
    householdId: "household",
    goalId: "g",
    name: `Item ${amount}`,
    amount,
    dueDate: "2027-06-01",
    paidOn,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
});

const renderFooter = (targetAmount: number | null, items: SavingsItem[]) =>
    render(
        <ItemsFooter
            plan={{ goal: goal(targetAmount), items } as GoalPlan}
            money={money}
        />
    );

describe("ItemsFooter", () => {
    beforeEach(() => vi.clearAllMocks());

    it("says what's left to allocate, counting unpaid items only", () => {
        renderFooter(500_000, [item(300_000), item(50_000, "2026-10-01")]);
        expect(screen.getByText("£3,000.00")).toBeInTheDocument();
        expect(screen.getByText(/£2,000\.00 left to allocate/)).toBeInTheDocument();
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("says when the items fill the target exactly", () => {
        renderFooter(500_000, [item(500_000)]);
        expect(screen.getByText(/fully allocated/)).toBeInTheDocument();
    });

    it("offers to raise a target the items have gone past", async () => {
        renderFooter(500_000, [item(300_000), item(250_000)]);
        expect(screen.getByText(/£500\.00 over target/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Raise target to £5,500.00" }));
        await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith("Raised the target to £5,500.00."));
        expect(mocks.update).toHaveBeenCalledWith({ id: "g", expectedUpdatedAt: now, targetAmount: 550_000 });
        expect(mocks.invalidate).toHaveBeenCalled();
    });

    it("adds up what's still to pay on an item-by-item goal", () => {
        renderFooter(null, [item(65_000), item(12_000), item(48_000, "2026-10-01")]);
        expect(screen.getByText(/2 items/)).toBeInTheDocument();
        expect(screen.getByText("£770.00")).toBeInTheDocument();
        expect(screen.queryByText(/target/)).not.toBeInTheDocument();
    });
});
