import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    render,
    screen,
    fireEvent,
    waitFor,
    within,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

// Break-glass containment from the UI (#248). It signs the operator out too and
// can't be undone, so what's asserted here is that the typed confirmation really
// gates the mutation, and that a failure surfaces instead of going quiet.

const mocks = vi.hoisted(() => ({
    revokeAll: vi.fn().mockResolvedValue({ ok: true, count: 4 }),
}));

vi.mock("@/trpc", () => ({
    trpc: {
        sessions: {
            revokeAll: {
                useMutation: () => ({
                    mutateAsync: mocks.revokeAll,
                    isPending: false,
                }),
            },
        },
    },
}));

// Imported after the mocks are registered.
import { SignOutEveryoneSection } from "./SignOutEveryoneSection";

const renderSection = () =>
    render(
        <MantineProvider>
            <SignOutEveryoneSection />
        </MantineProvider>
    );

const openConfirm = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Sign everyone out" }));
    return screen.findByRole("dialog");
};

// Scoped to the dialog: the card's trigger carries the same label.
const confirmButton = () =>
    within(screen.getByRole("dialog")).getByRole("button", {
        name: "Sign everyone out",
    });

const type = (value: string) =>
    fireEvent.change(screen.getByLabelText(/to confirm/), {
        target: { value },
    });

beforeEach(() => {
    vi.clearAllMocks();
});

describe("SignOutEveryoneSection", () => {
    it("won't revoke until the phrase is typed", async () => {
        renderSection();
        await openConfirm();

        expect(confirmButton()).toBeDisabled();
        type("sign out everybody");
        expect(confirmButton()).toBeDisabled();

        type("sign out everyone");
        expect(confirmButton()).toBeEnabled();
        fireEvent.click(confirmButton());
        await waitFor(() => expect(mocks.revokeAll).toHaveBeenCalled());
    });

    // The operator is about to sign themselves out; the dialog has to say so
    // before they type, not after they're at the login screen wondering.
    it("says the operator goes too, and that credentials are untouched", async () => {
        renderSection();
        const dialog = await openConfirm();

        expect(dialog).toHaveTextContent("signs you out too");
        expect(dialog).toHaveTextContent(/passwords, two-factor and data/);
    });

    it("surfaces a refusal rather than going quiet", async () => {
        mocks.revokeAll.mockRejectedValueOnce(
            new Error("Only the instance owner can do this.")
        );
        renderSection();
        await openConfirm();

        type("sign out everyone");
        fireEvent.click(confirmButton());
        expect(
            await screen.findByText("Only the instance owner can do this.")
        ).toBeInTheDocument();
    });
});
