import { describe, expect, it } from "vitest";
import { isIos } from "./iosViewport";

describe("isIos", () => {
    it("spots an iPhone", () => {
        expect(isIos("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)", "iPhone", 5)).toBe(true);
    });

    it("spots an iPad posing as a Mac", () => {
        expect(isIos("Mozilla/5.0 (Macintosh)", "MacIntel", 5)).toBe(true);
    });

    it("leaves a real Mac and Android alone", () => {
        expect(isIos("Mozilla/5.0 (Macintosh)", "MacIntel", 0)).toBe(false);
        expect(isIos("Mozilla/5.0 (Linux; Android 14)", "Linux armv8l", 5)).toBe(false);
    });
});
