import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

// Changing your email drops its confirmed state, and with it password reset
// (#198). Saving has to say so, and offer the send as its own explicit press.

const mocks = vi.hoisted(() => ({
    updateMutate: vi.fn().mockResolvedValue({ id: "u-1" }),
    sendMutate: vi.fn().mockResolvedValue({ sent: true }),
    invalidate: vi.fn().mockResolvedValue(undefined),
    me: {} as Record<string, unknown>,
    authStatus: {} as Record<string, unknown>,
    emailStatus: {} as Record<string, unknown>,
}));

vi.mock("@/trpc", () => {
    const mutation = (mutateAsync: unknown) => ({
        useMutation: () => ({ mutateAsync, isPending: false, error: null }),
    });
    return {
        trpc: {
            useUtils: () => ({
                users: { me: { invalidate: mocks.invalidate } },
                auth: { status: { invalidate: mocks.invalidate } },
                email: { status: { invalidate: mocks.invalidate } },
            }),
            users: {
                me: { useQuery: () => ({ data: mocks.me }) },
                updateProfile: mutation(mocks.updateMutate),
            },
            auth: { status: { useQuery: () => ({ data: mocks.authStatus }) } },
            email: {
                status: { useQuery: () => ({ data: mocks.emailStatus }) },
                sendVerification: mutation(mocks.sendMutate),
            },
        },
    };
});

// Imported after the mock is registered.
import { AccountSection } from "./AccountSection";

const renderSection = () =>
    render(
        <MantineProvider>
            <AccountSection />
        </MantineProvider>
    );

const typeEmail = (value: string) =>
    fireEvent.change(screen.getByLabelText("Email"), { target: { value } });

const save = () =>
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

beforeEach(() => {
    vi.clearAllMocks();
    mocks.me = {
        username: "ben",
        displayName: "Ben Carter",
        email: "old@example.com",
    };
    // Password-less instance, so no "current password" field gets in the way.
    mocks.authStatus = { passwordSet: false, passwordResetAvailable: true };
    mocks.emailStatus = {
        enabled: true,
        email: "old@example.com",
        verified: true,
    };
});

describe("AccountSection email change", () => {
    it("warns before saving a new address, naming it", async () => {
        renderSection();
        typeEmail("new@example.com");
        save();

        const dialog = await screen.findByRole("dialog");
        expect(dialog).toHaveTextContent("new@example.com");
        expect(dialog).toHaveTextContent(/only ever mails a confirmed address/);
        expect(mocks.updateMutate).not.toHaveBeenCalled();
    });

    it("saves and sends the link when asked to", async () => {
        renderSection();
        typeEmail("new@example.com");
        save();
        fireEvent.click(
            await screen.findByRole("button", { name: "Save and send link" })
        );

        await waitFor(() => expect(mocks.sendMutate).toHaveBeenCalled());
        expect(mocks.updateMutate).toHaveBeenCalledWith(
            expect.objectContaining({ email: "new@example.com" })
        );
    });

    it("saves without mailing anything when that's the choice", async () => {
        renderSection();
        typeEmail("new@example.com");
        save();
        fireEvent.click(
            await screen.findByRole("button", { name: "Save without sending" })
        );

        await waitFor(() => expect(mocks.updateMutate).toHaveBeenCalled());
        expect(mocks.sendMutate).not.toHaveBeenCalled();
    });

    it("saves nothing when the warning is cancelled", async () => {
        renderSection();
        typeEmail("new@example.com");
        save();
        fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

        await waitFor(() =>
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
        );
        expect(mocks.updateMutate).not.toHaveBeenCalled();
    });

    it("doesn’t warn about edits that leave the address alone", async () => {
        renderSection();
        fireEvent.change(screen.getByLabelText("Name"), {
            target: { value: "Ben C" },
        });
        save();

        await waitFor(() => expect(mocks.updateMutate).toHaveBeenCalled());
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("doesn’t warn on an instance that can’t send the link", async () => {
        mocks.authStatus = {
            passwordSet: false,
            passwordResetAvailable: false,
        };
        mocks.emailStatus = { enabled: false, email: null, verified: false };
        renderSection();
        typeEmail("new@example.com");
        save();

        await waitFor(() => expect(mocks.updateMutate).toHaveBeenCalled());
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("doesn’t warn when the address is being removed", async () => {
        renderSection();
        typeEmail("");
        save();

        await waitFor(() =>
            expect(mocks.updateMutate).toHaveBeenCalledWith(
                expect.objectContaining({ email: null })
            )
        );
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("keeps the profile change when the confirmation email fails to send", async () => {
        mocks.sendMutate.mockRejectedValueOnce(new Error("SMTP is down"));
        renderSection();
        typeEmail("new@example.com");
        save();
        fireEvent.click(
            await screen.findByRole("button", { name: "Save and send link" })
        );

        await waitFor(() => expect(mocks.invalidate).toHaveBeenCalled());
        expect(mocks.updateMutate).toHaveBeenCalled();
        expect(await screen.findByText("SMTP is down")).toBeInTheDocument();
    });
});
