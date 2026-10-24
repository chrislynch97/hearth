import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanLineRow } from "./PlanLineRow";

const renderRow = (perPeriod?: string) =>
    render(
        <PlanLineRow
            name="Car tax"
            emergencyFund={false}
            meta="yearly"
            amount="£640.00"
            perPeriod={perPeriod}
            ariaLabel="Edit Car tax"
            onClick={() => {}}
        />
    );

describe("PlanLineRow", () => {
    it("shows the per-period share under the amount", () => {
        renderRow("£53.33/mo");

        expect(screen.getByText("£640.00")).toBeInTheDocument();
        expect(screen.getByText("£53.33/mo")).toBeInTheDocument();
    });

    it("shows only the amount when there's no per-period share", () => {
        renderRow();

        expect(
            screen.getByRole("button", { name: "Edit Car tax" })
        ).toHaveTextContent(/^Car taxyearly£640\.00$/);
    });
});
