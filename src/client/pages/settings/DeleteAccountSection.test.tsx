import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    render,
    screen,
    fireEvent,
    waitFor,
    within,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

// Erasing the login identity (#230), as opposed to the household. Irreversible
// and confirmed twice over, so what's asserted here is that the confirmation
// really gates the mutation, that the refusals explain themselves rather than
// going quiet, and that the dialog names what goes with the account.

const mocks = vi.hoisted(() => ({
    deleteMutate: vi.fn().mockResolvedValue({ ok: true, householdsDeleted: 0 }),
    me: {} as Record<string, unknown>,
    impact: {} as Record<string, unknown>,
}));

vi.mock("@/trpc", () => ({
    trpc: {
        users: {
            me: { useQuery: () => ({ data: mocks.me }) },
            deletionImpact: { useQuery: () => ({ data: mocks.impact }) },
            deleteAccount: {
                useMutation: () => ({
                    mutateAsync: mocks.deleteMutate,
                    isPending: false,
                }),
            },
        },
    },
}));

// Imported after the mocks are registered.
import { DeleteAccountSection } from "./DeleteAccountSection";

const renderSection = () =>
    render(
        <MantineProvider>
            <DeleteAccountSection />
        </MantineProvider>
    );

const openConfirm = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    return screen.findByRole("dialog");
};

// Scoped to the dialog: the card's trigger carries the same label.
const confirmButton = () =>
    within(screen.getByRole("dialog")).getByRole("button", {
        name: "Delete my account",
    });

const type = (label: string | RegExp, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
    vi.clearAllMocks();
    mocks.me = { username: "ada" };
    mocks.impact = {
        blockedBy: [],
        households: [],
        isInstanceOwner: false,
        passwordRequired: true,
        mfaRequired: false,
    };
});

describe("DeleteAccountSection", () => {
    it("won't delete until the username and password are both given", async () => {
        renderSection();
        await openConfirm();

        expect(confirmButton()).toBeDisabled();
        type(/Type ada to confirm/, "ada");
        expect(confirmButton()).toBeDisabled(); // password still missing
        type("Current password", "correct-horse-staple");
        expect(confirmButton()).toBeEnabled();

        fireEvent.click(confirmButton());
        await waitFor(() => expect(mocks.deleteMutate).toHaveBeenCalled());
        expect(mocks.deleteMutate).toHaveBeenCalledWith({
            currentPassword: "correct-horse-staple",
            code: undefined,
        });
    });

    it("asks for an authenticator code where the account is enrolled", async () => {
        mocks.impact = { ...mocks.impact, mfaRequired: true };
        renderSection();
        await openConfirm();

        type(/Type ada to confirm/, "ada");
        type("Current password", "correct-horse-staple");
        expect(confirmButton()).toBeDisabled();

        type("Authentication code", "123456");
        fireEvent.click(confirmButton());
        await waitFor(() => expect(mocks.deleteMutate).toHaveBeenCalled());
        expect(mocks.deleteMutate).toHaveBeenCalledWith({
            currentPassword: "correct-horse-staple",
            code: "123456",
        });
    });

    it("names the households that go with the account", async () => {
        mocks.impact = {
            ...mocks.impact,
            households: [{ id: "h2", name: "Maple Street" }],
        };
        renderSection();

        expect(await openConfirm()).toHaveTextContent(
            "Maple Street, and everything in it"
        );
    });

    // A disabled button with no explanation reads as the right not existing.
    it("explains why the sole owner of a shared household is refused", () => {
        mocks.impact = {
            ...mocks.impact,
            blockedBy: [{ id: "h2", name: "Maple Street" }],
        };
        renderSection();

        expect(
            screen.getByRole("button", { name: "Delete my account" })
        ).toBeDisabled();
        expect(
            screen.getByText(/only owner of Maple Street/)
        ).toBeInTheDocument();
    });

    it("explains why the instance owner is refused", () => {
        mocks.impact = { ...mocks.impact, isInstanceOwner: true };
        renderSection();

        expect(
            screen.getByRole("button", { name: "Delete my account" })
        ).toBeDisabled();
        expect(
            screen.getByText(/instance owner's account/)
        ).toBeInTheDocument();
    });
});
