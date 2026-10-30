import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { MoneyFormat } from "@/useMoney";
import type { Report } from "../model";
import { CategorySpendCard } from "./CategorySpendCard";

const money: MoneyFormat = {
    symbol: "£",
    decimalPlaces: 2,
    locale: "en-GB",
    symbolPosition: "prefix",
    groupSeparator: ",",
    decimalSeparator: ".",
};

const report = {
    categoryBreakdown: {
        total: 15000,
        rows: [
            { categoryId: "food", name: "Food", spent: 10000 },
            { categoryId: "fun", name: "Fun", spent: 5000 },
        ],
    },
    spendVsAllocation: [
        { categoryId: "food", name: "Food", planned: 8000, actual: 10000 },
        { categoryId: "fun", name: "Fun", planned: 0, actual: 5000 },
        { categoryId: "rent", name: "Rent", planned: 90000, actual: 0 },
    ],
    monthOverMonth: {
        months: ["2026-09", "2026-10"],
        rows: [
            { categoryId: "food", name: "Food", byMonth: [9000, 10000] },
            { categoryId: "fun", name: "Fun", byMonth: [0, 5000] },
        ],
    },
} as unknown as Report;

const period = {
    label: "1 Oct – 31 Oct",
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    isCurrent: true,
    onCurrent: vi.fn(),
};

const renderCard = (showPlan = true) =>
    render(
        <CategorySpendCard
            report={report}
            money={money}
            showPlan={showPlan}
            period={period}
        />
    );

const row = (name: string) =>
    within(screen.getByText(name, { selector: "span" }).closest("tr")!);

describe("CategorySpendCard", () => {
    it("leaves out a planned category nothing was spent in", () => {
        renderCard();

        expect(screen.queryByText("Rent")).not.toBeInTheDocument();
    });

    it("marks a category that went over its plan", () => {
        renderCard();

        expect(row("Food").getByText("£100.00")).toHaveClass("text-danger");
        expect(row("Fun").getByText("£50.00")).not.toHaveClass("text-danger");
    });

    it("drops the plan when looking at one person's spending", () => {
        renderCard(false);

        expect(screen.queryByText("Planned")).not.toBeInTheDocument();
        expect(row("Food").getByText("£100.00")).not.toHaveClass("text-danger");
    });
});
