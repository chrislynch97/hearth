import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

// The nudge covers two dead-recovery states: no address where one is required
// (#199), and an address that's present but unproven (#198) — which is how an
// invited account, or one whose address was just changed, arrives.

const mocks = vi.hoisted(() => ({
    sendMutate: vi.fn().mockResolvedValue({ sent: true }),
    authStatus: {} as Record<string, unknown>,
    emailStatus: {} as Record<string, unknown>,
}));

vi.mock("@/trpc", () => ({
    trpc: {
        auth: { status: { useQuery: () => ({ data: mocks.authStatus }) } },
        email: {
            status: { useQuery: () => ({ data: mocks.emailStatus }) },
            sendVerification: {
                useMutation: () => ({
                    mutateAsync: mocks.sendMutate,
                    isPending: false,
                    error: null,
                }),
            },
        },
    },
}));

vi.mock("@tanstack/react-router", () => ({
    Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
        <a href={to}>{children}</a>
    ),
}));

// Imported after the mocks are registered.
import { AccountEmailBanner } from "./AccountEmailBanner";

const renderBanner = () =>
    render(
        <MantineProvider>
            <AccountEmailBanner />
        </MantineProvider>
    );

const CONFIRM = "Confirm your email address";
const ADD = "Add an email address";

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // LAN instance with login on: an address is optional, but an unconfirmed one
    // still leaves no way back in.
    mocks.authStatus = { passwordSet: true };
    mocks.emailStatus = {
        enabled: true,
        email: "ben@example.com",
        verified: false,
        required: false,
    };
});

describe("AccountEmailBanner", () => {
    it("raises an unconfirmed address wherever there's a password to lose", () => {
        renderBanner();
        expect(screen.getByText(CONFIRM)).toBeInTheDocument();
    });

    it("stays out of the way once the address is confirmed", () => {
        mocks.emailStatus = { ...mocks.emailStatus, verified: true };
        renderBanner();
        expect(screen.queryByText(CONFIRM)).not.toBeInTheDocument();
    });

    it("says nothing on an instance that can't send mail", () => {
        mocks.emailStatus = { ...mocks.emailStatus, enabled: false };
        renderBanner();
        expect(screen.queryByText(CONFIRM)).not.toBeInTheDocument();
    });

    it("says nothing on an open instance, where there's no password to lose", () => {
        mocks.authStatus = { passwordSet: false };
        renderBanner();
        expect(screen.queryByText(CONFIRM)).not.toBeInTheDocument();
    });

    it("asks for an address only where one is required", () => {
        mocks.emailStatus = { ...mocks.emailStatus, email: null };
        renderBanner();
        expect(screen.queryByText(ADD)).not.toBeInTheDocument();
    });

    it("asks for a missing address on an instance that requires one", () => {
        mocks.emailStatus = {
            ...mocks.emailStatus,
            email: null,
            required: true,
        };
        renderBanner();
        expect(screen.getByText(ADD)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Add one" })).toHaveAttribute(
            "href",
            "/settings/account"
        );
    });

    it("sends the link and says where it went", async () => {
        renderBanner();
        fireEvent.click(
            screen.getByRole("button", { name: "Send confirmation email" })
        );

        await waitFor(() => expect(mocks.sendMutate).toHaveBeenCalled());
        expect(
            await screen.findByText(
                "Check ben@example.com for the confirmation link."
            )
        ).toBeInTheDocument();
    });

    it("reports a send that fails instead of swallowing it", async () => {
        mocks.sendMutate.mockRejectedValueOnce(new Error("SMTP is down"));
        renderBanner();
        fireEvent.click(
            screen.getByRole("button", { name: "Send confirmation email" })
        );

        expect(await screen.findByText("SMTP is down")).toBeInTheDocument();
    });

    it("stays dismissed for that address, and returns for a new one", () => {
        const { unmount } = renderBanner();
        fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
        expect(screen.queryByText(CONFIRM)).not.toBeInTheDocument();
        unmount();

        renderBanner();
        expect(screen.queryByText(CONFIRM)).not.toBeInTheDocument();

        mocks.emailStatus = { ...mocks.emailStatus, email: "new@example.com" };
        renderBanner();
        expect(screen.getByText(CONFIRM)).toBeInTheDocument();
    });
});
