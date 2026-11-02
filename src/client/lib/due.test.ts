import { describe, expect, it } from "vitest";
import { dueLabel, dueStatus } from "@/lib/due";

describe("dueStatus and dueLabel", () => {
    const today = "2026-06-10";

    it("sorts deadlines into how pressing they are", () => {
        expect(dueStatus("2026-06-09", today)).toBe("overdue");
        expect(dueStatus("2026-06-10", today)).toBe("today");
        expect(dueStatus("2026-06-17", today)).toBe("soon");
        expect(dueStatus("2026-06-18", today)).toBe("later");
    });

    it("words near deadlines and dates far ones", () => {
        expect(dueLabel("2026-06-10", today, "x")).toBe("Today");
        expect(dueLabel("2026-06-11", today, "x")).toBe("Tomorrow");
        expect(dueLabel("2026-06-09", today, "x")).toBe("Yesterday");
        expect(dueLabel("2026-06-07", today, "x")).toBe("3 days late");
        expect(dueLabel("2026-06-13", today, "x")).toBe("In 3 days");
        expect(dueLabel("2026-08-01", today, "1 Aug")).toBe("1 Aug");
    });
});
