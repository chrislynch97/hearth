import { describe, it, expect } from "vitest";
import { isImportable, seedDecisions, type PreviewRow } from "./importModel";

const row = (index: number, status: PreviewRow["status"]) =>
    ({ index, status, suggestedPotId: "pot" }) as PreviewRow;

describe("seedDecisions", () => {
    it("includes new and foreign rows, and carries the suggested pot", () => {
        const seeded = seedDecisions([
            row(0, "new"),
            row(1, "foreign"),
            row(2, "excluded"),
            row(3, "duplicate"),
        ]);

        expect(seeded[0]).toEqual({ included: true, potId: "pot" });
        expect(seeded[1]?.included).toBe(true);
        expect(seeded[2]?.included).toBe(false);
        expect(seeded[3]?.included).toBe(false);
    });
});

describe("isImportable", () => {
    it("lets an internal move be ticked, but never a duplicate or an error", () => {
        expect(isImportable(row(0, "excluded"))).toBe(true);
        expect(isImportable(row(1, "duplicate"))).toBe(false);
        expect(isImportable(row(2, "error"))).toBe(false);
    });
});
