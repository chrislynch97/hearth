import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type { MoneyFormat } from "@/useMoney";
import type { Report } from "../model";
import { MonthlySpendingCard } from "./MonthlySpendingCard";

const money: MoneyFormat = {
    symbol: "£",
    decimalPlaces: 2,
    locale: "en-GB",
    symbolPosition: "prefix",
    groupSeparator: ",",
    decimalSeparator: ".",
};

const row = (month: string, total: number, change: number | null) => ({
    month,
    total,
    count: 1,
    change,
});

// Only `monthlyTotals` is read; the rest of the report is irrelevant here.
const report = (rows: ReturnType<typeof row>[]) =>
    ({
        monthlyTotals: {
            rows,
            average: 0,
            highest: null,
            lowest: null,
        },
    }) as unknown as Report;

const renderCard = (rows: ReturnType<typeof row>[]) =>
    render(
        <MantineProvider>
            <MonthlySpendingCard report={report(rows)} money={money} dp={2} />
        </MantineProvider>
    );

describe("MonthlySpendingCard", () => {
    it("reads a rise in spending as the bad direction and a fall as the good one", () => {
        renderCard([
            row("2026-05", 10000, null),
            row("2026-06", 15000, 5000),
            row("2026-07", 12000, -3000),
        ]);

        const deltas = document.querySelectorAll("[data-mc-valence]");
        // Spending more is `neg` even though the number itself is positive —
        // the card passes `positive="down"`.
        expect(deltas[0]).toHaveAttribute("data-mc-valence", "neg");
        expect(deltas[1]).toHaveAttribute("data-mc-valence", "pos");
    });

    it("formats the change as currency, not as the default percentage", () => {
        renderCard([row("2026-05", 10000, null), row("2026-06", 15000, 5000)]);

        expect(screen.getByText("+£50.00")).toBeInTheDocument();
    });

    it("leaves the first month's change blank rather than charting a null", () => {
        renderCard([row("2026-05", 10000, null)]);

        expect(document.querySelectorAll("[data-mc-valence]")).toHaveLength(0);
    });

    it("hides the proportional bars from assistive tech — the totals are adjacent", () => {
        renderCard([row("2026-05", 10000, null)]);

        const bar = document.querySelector(".mc-progress");
        expect(bar).toHaveAttribute("aria-hidden", "true");
    });
});
