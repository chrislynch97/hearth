import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MoneyFormat } from "@/useMoney";
import { PotCard } from "./PotCard";
import type { Expense, Pot } from "../../../../server/db/schema";

const money: MoneyFormat = {
    symbol: "£",
    decimalPlaces: 2,
    locale: "en-GB",
    symbolPosition: "prefix",
    groupSeparator: ",",
    decimalSeparator: ".",
};

const now = new Date("2026-10-24");

const pot: Pot = {
    id: "p1",
    householdId: "household",
    name: "Car",
    categoryId: null,
    ownerId: "joint",
    sortOrder: 0,
    note: null,
    interestRateBp: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
};

const carTax: Expense = {
    id: "b1",
    householdId: "household",
    name: "Car tax",
    recurrence: "yearly",
    amount: 64000,
    funding: "pot_auto",
    potId: "p1",
    categoryId: null,
    ownerId: null,
    note: null,
    active: 1,
    includeInEmergencyFund: 0,
    dueAnchor: null,
    dueReminderDays: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
};

const noop = () => {};

const renderCard = (shown: Pot) =>
    render(
        <PotCard
            planPot={{
                pot: shown,
                owner: undefined,
                bills: [carTax],
                setAsides: [],
                perPeriod: 5333,
            }}
            money={money}
            frequency="monthly"
            unit="/mo"
            staleStandingOrder={undefined}
            shouldHold={undefined}
            acknowledging={false}
            onAcknowledge={noop}
            onEditPot={noop}
            onAddBill={noop}
            onEditBill={noop}
            onAddSetAside={noop}
            onEditSetAside={noop}
        />
    );

describe("PotCard", () => {
    // The as-paid amount means nothing without how often it's paid, so a
    // self-deducting bill keeps its recurrence beside the auto tag.
    it("tags an auto bill with its recurrence, as paid, with its share", () => {
        renderCard(pot);

        const line = screen.getByRole("button", { name: "Edit Car tax" });

        expect(line).toHaveTextContent("yearly · auto");
        expect(line).toHaveTextContent("£640.00");
        expect(line).toHaveTextContent("£53.33/mo");
    });

    it("shows the pot's interest rate only when it has one", () => {
        renderCard({ ...pot, interestRateBp: 450 });
        expect(screen.getByText("4.50% AER")).toBeInTheDocument();
    });

    it("says nothing about interest on a pot without a rate", () => {
        renderCard(pot);
        expect(screen.queryByText(/AER/)).not.toBeInTheDocument();
    });
});
