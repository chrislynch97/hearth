import { describe, it, expect } from "vitest";
import {
    budgetSegments,
    giftLink,
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
    const dated = (id: string, date: string | null, archived = false) => ({
        ...occasion(id, archived),
        date,
    });
    const TODAY = "2026-10-24";

    it("shows the one asked for, archived or not", () => {
        const list = [occasion("a"), occasion("b", true)];
        expect(pickOccasion(list, "b", TODAY)?.id).toBe("b");
    });

    it("prefers the next one coming up over a past one left unarchived", () => {
        const list = [
            dated("birthday", "2026-03-02"),
            dated("xmas", "2026-12-25"),
            dated("easter", "2027-04-04"),
        ];
        expect(pickOccasion(list, undefined, TODAY)?.id).toBe("xmas");
        expect(pickOccasion(list, "gone", "2026-12-25")?.id).toBe("xmas");
    });

    it("falls back to undated, then the latest past one, then archived", () => {
        expect(
            pickOccasion(
                [dated("past", "2026-01-01"), dated("open", null)],
                undefined,
                TODAY
            )?.id
        ).toBe("open");
        expect(
            pickOccasion(
                [dated("older", "2025-12-25"), dated("newer", "2026-03-02")],
                undefined,
                TODAY
            )?.id
        ).toBe("newer");
        expect(
            pickOccasion([occasion("old", true)], undefined, TODAY)?.id
        ).toBe("old");
        expect(pickOccasion([], undefined, TODAY)).toBeUndefined();
    });
});

describe("giftLink", () => {
    it("links a web address, labelled by its site", () => {
        expect(giftLink("https://www.lego.com/en-gb/product/1")).toEqual({
            href: "https://www.lego.com/en-gb/product/1",
            label: "lego.com",
        });
    });

    it("leaves shop names and other schemes as text", () => {
        expect(giftLink("Smyths")).toBeNull();
        expect(giftLink("javascript:alert(1)")).toBeNull();
        expect(giftLink(null)).toBeNull();
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
