import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    render,
    screen,
    fireEvent,
    waitFor,
    within,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

// The "lost phone" reset (issue #51): clearing a member's second factor is an
// explicit opt-in on the reset, and only offered to someone who has one.

const mocks = vi.hoisted(() => ({
    resetMutate: vi.fn().mockResolvedValue({ ok: true }),
    invalidate: vi.fn().mockResolvedValue(undefined),
    rows: [] as unknown[],
}));

vi.mock("../trpc", () => {
    const mutation = (mutateAsync: unknown) => ({
        useMutation: () => ({ mutateAsync, isPending: false, error: null }),
    });
    return {
        trpc: {
            useUtils: () => ({
                access: { list: { invalidate: mocks.invalidate } },
            }),
            access: {
                list: { useQuery: () => ({ data: mocks.rows }) },
                setRole: mutation(vi.fn()),
                remove: mutation(vi.fn()),
                resetPassword: mutation(mocks.resetMutate),
            },
        },
    };
});

// Imported after the mock is registered.
import { AccessList } from "./SettingsPage";

const member = (over: Record<string, unknown> = {}) => ({
    userId: "u-ben",
    username: "ben",
    displayName: "Ben Carter",
    email: null,
    role: "member",
    mfaEnabled: false,
    isYou: false,
    acceptedAt: new Date(0),
    ...over,
});

const renderList = () =>
    render(
        <MantineProvider>
            <AccessList isOwner />
        </MantineProvider>
    );

/** Open the modal from the member's row, and return it — the row trigger and the
 *  modal's submit share a name, so every later query has to be scoped to one. */
const openResetModal = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    await screen.findByLabelText("New password");
    return within(screen.getByRole("dialog"));
};

const CLEAR_MFA_LABEL = "Also turn off two-factor authentication";

beforeEach(() => {
    vi.clearAllMocks();
    mocks.rows = [member({ mfaEnabled: true })];
});

describe("AccessList reset-password modal", () => {
    it("offers to clear MFA only for a member who actually has it on", async () => {
        renderList();
        const modal = await openResetModal();
        expect(modal.getByLabelText(CLEAR_MFA_LABEL)).toBeInTheDocument();
    });

    it("doesn’t offer it for a member with no second factor to lose", async () => {
        mocks.rows = [member({ mfaEnabled: false })];
        renderList();
        const modal = await openResetModal();
        expect(modal.queryByLabelText(CLEAR_MFA_LABEL)).not.toBeInTheDocument();
    });

    it("leaves MFA alone unless the box is ticked", async () => {
        renderList();
        const modal = await openResetModal();
        fireEvent.change(modal.getByLabelText("New password"), {
            target: { value: "a-brand-new-strong-pw" },
        });
        fireEvent.click(modal.getByRole("button", { name: "Reset password" }));

        await waitFor(() => expect(mocks.resetMutate).toHaveBeenCalled());
        expect(mocks.resetMutate).toHaveBeenCalledWith({
            userId: "u-ben",
            newPassword: "a-brand-new-strong-pw",
            clearMfa: false,
        });
    });

    it("asks the server to clear MFA when the box is ticked, and says so afterwards", async () => {
        renderList();
        const modal = await openResetModal();
        fireEvent.change(modal.getByLabelText("New password"), {
            target: { value: "a-brand-new-strong-pw" },
        });
        fireEvent.click(modal.getByLabelText(CLEAR_MFA_LABEL));
        fireEvent.click(modal.getByRole("button", { name: "Reset password" }));

        await waitFor(() => expect(mocks.resetMutate).toHaveBeenCalled());
        expect(mocks.resetMutate).toHaveBeenCalledWith({
            userId: "u-ben",
            newPassword: "a-brand-new-strong-pw",
            clearMfa: true,
        });
        // The admin has to know 2FA is off, or the member is left half-recovered.
        expect(await screen.findByText(/2FA is off/)).toBeInTheDocument();
    });

    it("won’t send a password the policy rejects", async () => {
        renderList();
        const modal = await openResetModal();
        fireEvent.change(modal.getByLabelText("New password"), {
            target: { value: "short" },
        });
        fireEvent.click(modal.getByRole("button", { name: "Reset password" }));

        // Scoped to the alert: the field's own hint says "At least 10 characters" too.
        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent(
            /password must be at least 10 characters/i
        );
        expect(mocks.resetMutate).not.toHaveBeenCalled();
    });
});
