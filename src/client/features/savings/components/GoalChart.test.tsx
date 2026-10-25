import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { SavingsPlanInput } from "@shared/savings";
import type { MoneyFormat } from "@/useMoney";
import { GoalChart } from "./GoalChart";

const money: MoneyFormat = {
    symbol: "£",
    decimalPlaces: 2,
    locale: "en-GB",
    symbolPosition: "prefix",
    groupSeparator: ",",
    decimalSeparator: ".",
};

// £1,000 by 25 Apr with £600 due 30 Nov and £300 on 1 Feb; £100 a month in.
const input: SavingsPlanInput = {
    targetAmount: 100_000,
    targetDate: "2027-04-25",
    items: [
        { id: "units", name: "Units", amount: 60_000, dueDate: "2026-11-30", paidOn: null },
        { id: "tiles", name: "Tiles", amount: 30_000, dueDate: "2027-02-01", paidOn: null },
    ],
    balances: [{ asOfDate: "2026-10-24", amount: 10_000 }],
    contribution: 10_000,
    today: "2026-10-24",
    period: { frequency: "monthly", startDay: 25, anchor: "" },
};

const renderChart = () =>
    render(
        <GoalChart
            input={input}
            balanceNow={10_000}
            whatIf={null}
            money={money}
            formatDate={(iso) => iso}
        />
    );

describe("GoalChart", () => {
    it("opens on the first deadline the money misses", () => {
        renderChart();
        expect(screen.getByText("2026-11-30 · in 5 weeks")).toBeInTheDocument();
        expect(screen.getByText("Units")).toBeInTheDocument();
        expect(screen.getByText("£300.00 short")).toBeInTheDocument();
    });

    it("steps through every date with the arrows, no pointer needed", () => {
        renderChart();
        const next = screen.getByRole("button", { name: "Next date" });
        const previous = screen.getByRole("button", { name: "Previous date" });

        fireEvent.click(next);
        expect(screen.getByText("2027-02-01 · in 3 months")).toBeInTheDocument();
        expect(screen.getByText("Tiles")).toBeInTheDocument();

        fireEvent.click(next);
        expect(screen.getByText("Not itemised yet")).toBeInTheDocument();
        expect(next).toBeDisabled();

        fireEvent.click(previous);
        fireEvent.click(previous);
        fireEvent.click(previous);
        expect(screen.getByText("Today")).toBeInTheDocument();
        expect(previous).toBeDisabled();
    });
});
