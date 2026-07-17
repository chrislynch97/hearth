import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

// The wizard's "You" step (issue #61): a fresh install names its own account and
// gets a member linked to it without ever opening Settings.

const mocks = vi.hoisted(() => ({
    updateHousehold: vi.fn().mockResolvedValue({}),
    updateProfile: vi.fn().mockResolvedValue({}),
    addPerson: vi.fn().mockResolvedValue({ id: "m-new" }),
    linkUser: vi.fn().mockResolvedValue({ ok: true }),
    updateMember: vi.fn().mockResolvedValue({}),
    invalidate: vi.fn().mockResolvedValue(undefined),
    me: {} as Record<string, unknown> | null,
    members: [] as unknown[],
    passwordSet: false,
}));

vi.mock("../trpc", () => {
    const mutation = (mutateAsync: unknown) => ({
        useMutation: () => ({ mutateAsync, isPending: false, error: null }),
    });
    return {
        trpc: {
            useUtils: () => ({
                invalidate: mocks.invalidate,
                users: { me: { invalidate: mocks.invalidate } },
                members: { list: { invalidate: mocks.invalidate } },
                bootstrap: { context: { invalidate: mocks.invalidate } },
            }),
            bootstrap: {
                context: { useQuery: () => ({ data: { household: null } }) },
            },
            household: {
                update: mutation(mocks.updateHousehold),
                completeSetup: mutation(vi.fn()),
            },
            auth: {
                status: {
                    useQuery: () => ({
                        data: { passwordSet: mocks.passwordSet },
                    }),
                },
            },
            users: {
                me: { useQuery: () => ({ data: mocks.me }) },
                updateProfile: mutation(mocks.updateProfile),
            },
            members: {
                list: {
                    useQuery: () => ({ data: mocks.members, isLoading: false }),
                },
                addPerson: mutation(mocks.addPerson),
                linkUser: mutation(mocks.linkUser),
                update: mutation(mocks.updateMember),
                archive: mutation(vi.fn()),
            },
            data: { import: mutation(vi.fn()) },
        },
    };
});

// Imported after the mock is registered.
import { SetupWizard } from "./SetupWizard";

/** Render the wizard and advance past the Household step onto You. */
const renderOnYouStep = async () => {
    render(
        <MantineProvider>
            <SetupWizard
                householdName="Maple Street"
                currencyCode="GBP"
                locale="en-GB"
            />
        </MantineProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByLabelText("Your name");
};

const fillYou = async (name: string) => {
    fireEvent.change(screen.getByLabelText("Your name"), {
        target: { value: name },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
};

beforeEach(() => {
    vi.clearAllMocks();
    mocks.passwordSet = false;
    mocks.me = {
        id: "u-owner",
        username: "owner",
        displayName: "Owner",
        email: null,
    };
    mocks.members = [
        {
            id: "m-joint",
            kind: "joint",
            displayName: "Joint",
            userId: null,
            archivedAt: null,
            color: null,
        },
    ];
});

describe("SetupWizard — You step", () => {
    it("starts blank rather than showing the seeded owner placeholder", async () => {
        await renderOnYouStep();
        expect(screen.getByLabelText("Your name")).toHaveValue("");
        expect(screen.getByLabelText("Username")).toHaveValue("");
    });

    it("suggests a username from the name until you type your own", async () => {
        await renderOnYouStep();
        fireEvent.change(screen.getByLabelText("Your name"), {
            target: { value: "Chris Lynch" },
        });
        expect(screen.getByLabelText("Username")).toHaveValue("chris");

        fireEvent.change(screen.getByLabelText("Username"), {
            target: { value: "cl" },
        });
        fireEvent.change(screen.getByLabelText("Your name"), {
            target: { value: "Chris L" },
        });
        expect(screen.getByLabelText("Username")).toHaveValue("cl");
    });

    it("names the account and links a new member to it", async () => {
        await renderOnYouStep();
        await fillYou("Chris Lynch");

        await waitFor(() => expect(mocks.linkUser).toHaveBeenCalled());
        expect(mocks.updateProfile).toHaveBeenCalledWith({
            displayName: "Chris Lynch",
            username: "chris",
        });
        expect(mocks.addPerson).toHaveBeenCalledWith({
            displayName: "Chris Lynch",
        });
        expect(mocks.linkUser).toHaveBeenCalledWith({
            memberId: "m-new",
            userId: "u-owner",
        });
        // Advanced to Members, which is now only about everyone else.
        expect(await screen.findByLabelText("Add person")).toBeInTheDocument();
    });

    it("renames the linked member instead of adding a second one on re-entry", async () => {
        mocks.members = [
            ...mocks.members,
            {
                id: "m-me",
                kind: "person",
                displayName: "Chris",
                userId: "u-owner",
                archivedAt: null,
                color: null,
            },
        ];
        mocks.me = { ...mocks.me, username: "chris", displayName: "Chris" };
        await renderOnYouStep();
        await fillYou("Chris Lynch");

        await waitFor(() => expect(mocks.updateMember).toHaveBeenCalled());
        expect(mocks.updateMember).toHaveBeenCalledWith({
            id: "m-me",
            displayName: "Chris Lynch",
        });
        expect(mocks.addPerson).not.toHaveBeenCalled();
    });

    it("stays on the step and shows why when the username is taken", async () => {
        mocks.updateProfile.mockRejectedValueOnce(
            new Error("That username is taken.")
        );
        await renderOnYouStep();
        await fillYou("Chris Lynch");

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "That username is taken."
        );
        // Nothing half-applied: no member created against a rejected profile.
        expect(mocks.addPerson).not.toHaveBeenCalled();
        expect(screen.getByLabelText("Your name")).toBeInTheDocument();
    });

    it("asks for the password when FirstRunGate already set one", async () => {
        // Renaming away from `owner` is identity-bearing, so the server demands it.
        mocks.passwordSet = true;
        await renderOnYouStep();
        fireEvent.change(screen.getByLabelText("Your name"), {
            target: { value: "Chris Lynch" },
        });
        fireEvent.change(await screen.findByLabelText("Current password"), {
            target: { value: "the-owner-password" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Next" }));

        await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalled());
        expect(mocks.updateProfile).toHaveBeenCalledWith({
            displayName: "Chris Lynch",
            username: "chris",
            currentPassword: "the-owner-password",
        });
    });

    it("leaves the password out of it on an open instance", async () => {
        await renderOnYouStep();
        await fillYou("Chris Lynch");

        await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalled());
        expect(
            screen.queryByLabelText("Current password")
        ).not.toBeInTheDocument();
        expect(mocks.updateProfile).toHaveBeenCalledWith({
            displayName: "Chris Lynch",
            username: "chris",
            currentPassword: undefined,
        });
    });

    it("won't continue without a name", async () => {
        await renderOnYouStep();
        fireEvent.click(screen.getByRole("button", { name: "Next" }));

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Please enter your name."
        );
        expect(mocks.updateProfile).not.toHaveBeenCalled();
    });
});
