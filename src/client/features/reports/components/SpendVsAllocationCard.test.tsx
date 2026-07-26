import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type { MoneyFormat } from "@/useMoney";
import type { Report } from "../model";
import { SpendVsAllocationCard } from "./SpendVsAllocationCard";

const money: MoneyFormat = {
    symbol: "£",
    decimalPlaces: 2,
    locale: "en-GB",
    symbolPosition: "prefix",
    groupSeparator: ",",
    decimalSeparator: ".",
};

const report = (
    rows: Array<{
        categoryId: string | null;
        name: string;
        planned: number;
        actual: number;
        diff: number;
    }>
) => ({ spendVsAllocation: rows }) as unknown as Report;

const renderCard = (rows: Parameters<typeof report>[0]) =>
    render(
        <MantineProvider>
            <SpendVsAllocationCard report={report(rows)} money={money} dp={2} />
        </MantineProvider>
    );

describe("SpendVsAllocationCard", () => {
    it("describes each bullet as spend against that category's own plan", () => {
        renderCard([
            {
                categoryId: "c1",
                name: "Housing",
                planned: 152300,
                actual: 148000,
                diff: 4300,
            },
        ]);

        expect(
            screen.getByRole("img", {
                name: /Housing.*£1,480\.00 of £1,523\.00 target/,
            })
        ).toBeInTheDocument();
    });

    it("still renders a bullet for a category with no plan", () => {
        renderCard([
            {
                categoryId: null,
                name: "Uncategorised",
                planned: 0,
                actual: 5000,
                diff: -5000,
            },
        ]);

        expect(document.querySelectorAll(".mc-bullet")).toHaveLength(1);
    });
});
