import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { MoneyFormat } from "@/useMoney";
import type { ChartMoment } from "@/features/savings/chart";
import { GoalChartReadout } from "./GoalChartReadout";

const money: MoneyFormat = {
    symbol: "£",
    decimalPlaces: 2,
    locale: "en-GB",
    symbolPosition: "prefix",
    groupSeparator: ",",
    decimalSeparator: ".",
};

const units: ChartMoment = {
    date: "2026-11-30",
    kind: "deadline",
    due: [{ name: "Units", amount: 60_000 }],
    needed: 60_000,
    pot: 90_000,
    whatIf: 40_000,
};

const renderReadout = (moment: ChartMoment, whatIfAmount: number | null = 5_000) =>
    render(
        <GoalChartReadout
            id="readout"
            moment={moment}
            hasPrevious={moment.kind !== "today"}
            hasNext
            onStep={vi.fn()}
            today="2026-10-24"
            contribution={40_000}
            whatIfAmount={whatIfAmount}
            unit="/mo"
            money={money}
            formatDate={(iso) => iso}
        />
    );

describe("GoalChartReadout", () => {
    it("says what's due on a deadline and whether each amount covers it", () => {
        renderReadout(units);

        expect(screen.getByText("2026-11-30 · in 5 weeks")).toBeInTheDocument();
        expect(screen.getByText("Units")).toBeInTheDocument();
        expect(screen.getAllByText("£600.00")).toHaveLength(2);

        const current = screen.getByText("At £400.00/mo").parentElement!;
        expect(within(current).getByText("£900.00")).toBeInTheDocument();
        expect(within(current).getByText("✓ covered")).toBeInTheDocument();

        const whatIf = screen.getByText("What if £50.00/mo").parentElement!;
        expect(within(whatIf).getByText("£400.00")).toBeInTheDocument();
        expect(within(whatIf).getByText("£200.00 short")).toBeInTheDocument();
    });

    it("reads today as what's in the pot now, with nothing to compare", () => {
        renderReadout(
            { date: "2026-10-24", kind: "today", due: [], needed: 0, pot: 10_000, whatIf: 10_000 },
            null
        );

        expect(screen.getByText("Today")).toBeInTheDocument();
        expect(screen.getByText("In the pot now")).toBeInTheDocument();
        expect(screen.queryByText(/What if/)).not.toBeInTheDocument();
        expect(screen.queryByText(/covered|short/)).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Previous date" })).toBeDisabled();
    });
});
