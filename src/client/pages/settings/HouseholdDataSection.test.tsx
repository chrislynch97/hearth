import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

// The in-app route for a portability or erasure request (#228). Erasure is
// irreversible and owner-only, so what's asserted here is who sees the controls,
// that the confirmation really gates the mutation, and that the primary
// household explains itself rather than going quiet.

const mocks = vi.hoisted(() => ({
    eraseMutate: vi.fn().mockResolvedValue({ ok: true, nextHouseholdId: null }),
    exportFetch: vi.fn().mockResolvedValue({ version: 1, tables: {} }),
    downloadJson: vi.fn(),
    me: {} as Record<string, unknown>,
    ctx: {} as Record<string, unknown>,
    retention: {} as Record<string, unknown>,
    erasure: {} as Record<string, unknown>,
}));

vi.mock("@/trpc", () => ({
    trpc: {
        useUtils: () => ({
            data: { exportHousehold: { fetch: mocks.exportFetch } },
        }),
        users: { me: { useQuery: () => ({ data: mocks.me }) } },
        bootstrap: { context: { useQuery: () => ({ data: mocks.ctx }) } },
        data: {
            backupRetention: {
                useQuery: () => ({ data: mocks.retention }),
            },
            erasureImpact: {
                useQuery: () => ({ data: mocks.erasure }),
            },
            eraseHousehold: {
                useMutation: () => ({
                    mutateAsync: mocks.eraseMutate,
                    isPending: false,
                }),
            },
        },
    },
}));

vi.mock("@/csv", () => ({ downloadJson: mocks.downloadJson }));

// Imported after the mocks are registered.
import { HouseholdDataSection } from "./HouseholdDataSection";

const renderSection = () =>
    render(
        <MantineProvider>
            <HouseholdDataSection />
        </MantineProvider>
    );

/** Opens the confirmation and waits for the modal, which Mantine portals in on
 *  the tick after the click. */
const openConfirm = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    return screen.findByRole("dialog");
};

const typeName = (value: string) =>
    fireEvent.change(screen.getByLabelText("Type Maple Street to confirm"), {
        target: { value },
    });

const deleteButton = () =>
    screen.getByRole("button", { name: "Delete this household" });

beforeEach(() => {
    vi.clearAllMocks();
    mocks.me = {
        role: "owner",
        activeHouseholdId: "h2",
        isPrimaryHousehold: false,
        memberships: [{ householdId: "h2", householdName: "Maple Street" }],
    };
    mocks.ctx = {
        household: { displayName: "Maple Street", backupFrequency: "daily" },
    };
    mocks.retention = { keep: 14 };
    mocks.erasure = { accountsDeleted: 0, includesYou: false };
});

describe("HouseholdDataSection", () => {
    it("is hidden from anyone below owner", () => {
        for (const role of ["admin", "member", "viewer"]) {
            mocks.me = { ...mocks.me, role };
            const { unmount } = renderSection();
            expect(screen.queryByText("Your data")).not.toBeInTheDocument();
            expect(
                screen.queryByRole("button", { name: "Delete" })
            ).not.toBeInTheDocument();
            unmount();
        }
    });

    it("downloads the household snapshot under a dated filename", async () => {
        vi.setSystemTime(new Date("2026-08-01T10:00:00Z"));
        renderSection();
        fireEvent.click(
            screen.getByRole("button", { name: "Download my data" })
        );

        await waitFor(() => expect(mocks.downloadJson).toHaveBeenCalled());
        expect(mocks.downloadJson).toHaveBeenCalledWith(
            "hearth-maple-street-2026-08-01.json",
            { version: 1, tables: {} }
        );
        vi.useRealTimers();
    });

    it("won't erase until the household name is typed back", async () => {
        renderSection();
        await openConfirm();

        expect(deleteButton()).toBeDisabled();
        typeName("maple street");
        expect(deleteButton()).toBeDisabled();

        typeName("Maple Street");
        expect(deleteButton()).toBeEnabled();
        fireEvent.click(deleteButton());
        await waitFor(() => expect(mocks.eraseMutate).toHaveBeenCalled());
    });

    it("names the backup retention and where you'll land afterwards", async () => {
        mocks.me = {
            ...mocks.me,
            memberships: [
                { householdId: "h2", householdName: "Maple Street" },
                { householdId: "h3", householdName: "The Annexe" },
            ],
        };
        renderSection();
        const dialog = await openConfirm();

        expect(dialog).toHaveTextContent("most recent 14 snapshots are kept");
        expect(dialog).toHaveTextContent("switched to The Annexe");
    });

    it("says the copy is only in your own downloads when backups are off", async () => {
        mocks.ctx = {
            household: { displayName: "Maple Street", backupFrequency: "off" },
        };
        renderSection();

        expect(await openConfirm()).toHaveTextContent(
            /Automatic backups are off/
        );
    });

    // Erasure now takes accounts that belong to nothing else with it (#230), and
    // one of them may be the reader's own — that can't be a surprise afterwards.
    it("names the accounts that go with the household", async () => {
        mocks.erasure = { accountsDeleted: 3, includesYou: true };
        renderSection();

        expect(await openConfirm()).toHaveTextContent(
            "your account and 2 other accounts"
        );
    });

    it("says nothing about accounts when everyone belongs elsewhere too", async () => {
        renderSection();

        expect(await openConfirm()).not.toHaveTextContent(
            /only household they belong to/
        );
    });

    // eraseHousehold refuses DEFAULT_HOUSEHOLD_ID; a silently missing button
    // would leave the owner assuming the right doesn't exist.
    it("explains why the primary household can't be erased here", () => {
        mocks.me = { ...mocks.me, isPrimaryHousehold: true };
        renderSection();

        expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
        expect(screen.getByText(/Use Reset all data/)).toBeInTheDocument();
        // Export still works there — only erasure is instance-wide.
        expect(
            screen.getByRole("button", { name: "Download my data" })
        ).toBeEnabled();
    });
});
