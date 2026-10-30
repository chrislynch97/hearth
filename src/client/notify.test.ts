import { describe, it, expect, beforeEach, vi } from "vitest";
import { isConflictError, notifyError, notifySuccess } from "./notify";

// The toast library is the boundary; assert on what we hand it.
const toast = vi.hoisted(() => ({
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
}));
vi.mock("sonner", () => ({ toast }));

const lastCall = (fn: typeof toast.error) => {
    const [title, options] = fn.mock.calls.at(-1) ?? [];
    return { title, ...options };
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe("isConflictError", () => {
    it("recognises a tRPC CONFLICT", () => {
        expect(isConflictError({ data: { code: "CONFLICT" } })).toBe(true);
    });

    it("rejects any other tRPC code", () => {
        expect(isConflictError({ data: { code: "BAD_REQUEST" } })).toBe(false);
    });

    // Called from a global error handler, so it must survive whatever was thrown.
    it("survives values that are not shaped like a tRPC error", () => {
        expect(isConflictError(null)).toBe(false);
        expect(isConflictError(undefined)).toBe(false);
        expect(isConflictError(new Error("boom"))).toBe(false);
        expect(isConflictError("CONFLICT")).toBe(false);
        expect(isConflictError({})).toBe(false);
    });
});

describe("notifyError", () => {
    it("shows the error’s own message", () => {
        notifyError(new Error("Pot not found"));

        expect(lastCall(toast.error)).toMatchObject({
            title: "Something went wrong",
            description: "Pot not found",
        });
    });

    it("falls back to a generic message when there is nothing to show", () => {
        for (const thrown of [
            null,
            undefined,
            {},
            new Error(""),
            { message: "   " },
            { message: 42 },
        ]) {
            notifyError(thrown);
            expect(lastCall(toast.error).description).toBe(
                "Something went wrong. Please try again."
            );
        }
    });

    it("gives a conflict the calmer amber treatment, not the red one", () => {
        notifyError({
            data: { code: "CONFLICT" },
            message: "Changed since you loaded it",
        });

        expect(toast.error).not.toHaveBeenCalled();
        expect(lastCall(toast.warning)).toMatchObject({
            title: "Changed by someone else",
            description: "Changed since you loaded it",
        });
    });

    it("leaves a conflict toast up longer than an ordinary error", () => {
        notifyError({ data: { code: "CONFLICT" } });
        notifyError(new Error("boom"));

        expect(lastCall(toast.warning).duration).toBeGreaterThan(
            lastCall(toast.error).duration
        );
    });

    it("lets the caller override the title, conflict or not", () => {
        notifyError(new Error("boom"), { title: "Could not save" });
        expect(lastCall(toast.error).title).toBe("Could not save");

        notifyError(
            { data: { code: "CONFLICT" } },
            { title: "Could not save" }
        );
        expect(lastCall(toast.warning).title).toBe("Could not save");
    });
});

describe("notifySuccess", () => {
    it("shows the message on its own", () => {
        notifySuccess("Pot archived");

        expect(lastCall(toast.success)).toMatchObject({
            title: "Pot archived",
            description: undefined,
        });
    });

    it("puts the message under a title when one is given", () => {
        notifySuccess("Pot archived", { title: "Done" });

        expect(lastCall(toast.success)).toMatchObject({
            title: "Done",
            description: "Pot archived",
        });
    });
});
