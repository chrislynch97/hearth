import { describe, expect, it } from "vitest";
import { shouldDismiss } from "./useSheetDrag";

describe("shouldDismiss", () => {
    it("closes after a long pull, however slow", () => {
        expect(shouldDismiss(200, 0.1)).toBe(true);
    });

    it("closes on a quick flick, however short", () => {
        expect(shouldDismiss(40, 1)).toBe(true);
    });

    it("springs back from a short, slow pull", () => {
        expect(shouldDismiss(60, 0.2)).toBe(false);
    });
});
