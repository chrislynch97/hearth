import { describe, it, expect } from "vitest";
import {
    budgetSegments,
    giftsByStatus,
    moneyInput,
    nextStatus,
    parseOptionalMoney,
    pickOccasion,
    raisedOccasionBudget,
    validMoney,
    type OccasionSummary,
    type RecipientWithGifts,
} from "./model";

const occasion = (id: string, archived = false): OccasionSummary => ({
    id,
    householdId: "h",
    name: id,
    date: null,
    budget: null,
    archivedAt: archived ? new Date() : null,
    createdAt: new Date(),
    updatedAt: new Date(),
    totals: { budget: null, spent: 0, planned: 0, left: null },
    allocated: 0,
});

describe("pickOccasion", () => {
    it("shows the one asked for, archived or not", () => {
        const list = [occasion("a"), occasion("b", true)];
        expect(pickOccasion(list, "b")?.id).toBe("b");
    });

    it("falls back to the first live occasion", () => {
        const list = [occasion("old", true), occasion("now")];
        expect(pickOccasion(list, "gone")?.id).toBe("now");
        expect(pickOccasion(list, undefined)?.id).toBe("now");
    });

    it("shows an archived one when that's all there is", () => {
        expect(pickOccasion([occasion("old", true)], undefined)?.id).toBe(
            "old"
        );
        expect(pickOccasion([], undefined)).toBeUndefined();
    });
});

describe("nextStatus", () => {
    it("moves idea → bought → given and stops there", () => {
        expect(nextStatus("idea")).toBe("bought");
        expect(nextStatus("bought")).toBe("given");
        expect(nextStatus("given")).toBeNull();
    });
});

describe("budgetSegments", () => {
    const totals = (budget: number | null, spent: number, planned: number) => ({
        budget,
        spent,
        planned,
        left: budget === null ? null : budget - spent,
    });

    it("splits the budget into spent, ideas and free", () => {
        expect(budgetSegments(totals(30000, 15500, 4000))).toEqual([
            { tone: "spent", label: "Spent", value: 15500 },
            { tone: "idea", label: "Ideas", value: 4000 },
            { tone: "left", label: "Free", value: 10500 },
        ]);
    });

    it("shows the overspend and no free part when over", () => {
        expect(budgetSegments(totals(10000, 12000, 500))).toEqual([
            { tone: "spent", label: "Spent", value: 10000 },
            { tone: "over", label: "Over budget", value: 2000 },
            { tone: "idea", label: "Ideas", value: 500 },
        ]);
    });

    it("has nothing free to show without a budget", () => {
        expect(budgetSegments(totals(null, 3000, 0))).toEqual([
            { tone: "spent", label: "Spent", value: 3000 },
        ]);
    });
});

describe("giftsByStatus", () => {
    it("sorts every gift into its column with a total", () => {
        const gift = (id: string, status: string, amount: number) =>
            ({ id, status, amount }) as RecipientWithGifts["gifts"][number];
        const person = (name: string, gifts: RecipientWithGifts["gifts"]) =>
            ({ id: name, name, gifts }) as RecipientWithGifts;
        const columns = giftsByStatus([
            person("Mum", [gift("a", "bought", 6000), gift("b", "idea", 1800)]),
            person("Dad", [gift("c", "bought", 4500)]),
        ]);

        expect(columns.map((c) => [c.status, c.gifts.length, c.total])).toEqual(
            [
                ["idea", 1, 1800],
                ["bought", 2, 10500],
                ["given", 0, 0],
            ]
        );
        expect(columns[1]?.gifts.map((g) => g.recipient.name)).toEqual([
            "Mum",
            "Dad",
        ]);
    });
});

describe("money fields", () => {
    it("treats blank as no budget", () => {
        expect(parseOptionalMoney("  ", 2)).toBeNull();
        expect(parseOptionalMoney("12.50", 2)).toBe(1250);
        expect(moneyInput(null, 2)).toBe("");
        expect(moneyInput(1250, 2)).toBe("12.5");
    });

    it("needs a price but not a budget", () => {
        expect(validMoney("", true)).toBe("Enter a price.");
        expect(validMoney("", false)).toBe(true);
        expect(validMoney("-1", false)).toBe("Enter an amount.");
        expect(validMoney("abc", true)).toBe("Enter an amount.");
        expect(validMoney("0", true)).toBe(true);
    });
});

describe("raisedOccasionBudget", () => {
    it("names the new budget when this person tips the total over", () => {
        // £300 budget, £245 handed out, Mum at £80 going to £150.
        expect(raisedOccasionBudget(30000, 24500, 8000, 15000)).toBe(31500);
    });

    it("stays quiet while it fits, or with no occasion budget", () => {
        expect(raisedOccasionBudget(30000, 24500, 8000, 13500)).toBeNull();
        expect(raisedOccasionBudget(30000, 24500, null, null)).toBeNull();
        expect(raisedOccasionBudget(null, 24500, null, 90000)).toBeNull();
    });
});
