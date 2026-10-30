import { describe, expect, it } from "vitest";
import { PERSON_COLORS, personColor } from "@/personColor";

describe("personColor", () => {
    it("uses the colour a person picked", () => {
        expect(personColor("Ava", "#bf7282")).toBe("#bf7282");
    });

    it("gives the same palette colour to the same name when none is picked", () => {
        const values = PERSON_COLORS.map((c) => c.value) as string[];
        expect(values).toContain(personColor("Ava"));
        expect(personColor("Ava")).toBe(personColor("Ava", null));
    });

    it("treats a legacy palette name or an off-palette colour as unpicked", () => {
        expect(personColor("Ava", "grape")).toBe(personColor("Ava"));
        expect(personColor("Ava", "#ff0000")).toBe(personColor("Ava"));
    });
});
