import { describe, it, expect, beforeEach, vi } from "vitest";
import { isConflictError, notifyError, notifySuccess } from "./notify";

// The toast library is the boundary; assert on what we hand it.
const show = vi.hoisted(() => vi.fn());
vi.mock("@mantine/notifications", () => ({ notifications: { show } }));

const lastToast = () => show.mock.calls.at(-1)?.[0];

beforeEach(() => {
    show.mockClear();
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

        expect(lastToast()).toMatchObject({
            color: "red",
            title: "Something went wrong",
            message: "Pot not found",
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
            expect(lastToast().message).toBe(
                "Something went wrong. Please try again."
            );
        }
    });

    it("gives a conflict the calmer amber treatment, not the red one", () => {
        notifyError({
            data: { code: "CONFLICT" },
            message: "Changed since you loaded it",
        });

        expect(lastToast()).toMatchObject({
            color: "yellow",
            title: "Changed by someone else",
            message: "Changed since you loaded it",
        });
    });

    it("leaves a conflict toast up longer than an ordinary error", () => {
        notifyError({ data: { code: "CONFLICT" } });
        const conflict = lastToast().autoClose;

        notifyError(new Error("boom"));

        expect(conflict).toBeGreaterThan(lastToast().autoClose);
    });

    it("lets the caller override the title, conflict or not", () => {
        notifyError(new Error("boom"), { title: "Could not save" });
        expect(lastToast().title).toBe("Could not save");

        notifyError(
            { data: { code: "CONFLICT" } },
            { title: "Could not save" }
        );
        expect(lastToast().title).toBe("Could not save");
    });
});

describe("notifySuccess", () => {
    it("shows a green toast with the message", () => {
        notifySuccess("Pot archived");

        expect(lastToast()).toMatchObject({
            color: "teal",
            message: "Pot archived",
        });
    });

    it("has no title unless one is given", () => {
        notifySuccess("Pot archived");
        expect(lastToast().title).toBeUndefined();

        notifySuccess("Pot archived", { title: "Done" });
        expect(lastToast().title).toBe("Done");
    });
});
