import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { PayslipComponent } from "../model";

// Stable spies shared with the mocked trpc module (vi.mock is hoisted).
const mocks = vi.hoisted(() => ({
    updateMutate: vi.fn().mockResolvedValue({}),
    createMutate: vi.fn().mockResolvedValue({}),
    archiveMutate: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/trpc", () => {
    const mutation = (mutateAsync: unknown) => ({
        useMutation: () => ({ mutateAsync, isPending: false, error: null }),
    });
    return {
        trpc: {
            useUtils: () => ({
                payslipComponents: { list: { invalidate: mocks.invalidate } },
                income: { overview: { invalidate: mocks.invalidate } },
            }),
            payslipComponents: {
                create: mutation(mocks.createMutate),
                update: mutation(mocks.updateMutate),
                archive: mutation(mocks.archiveMutate),
            },
        },
    };
});

// Imported after the mock is registered.
import { ComponentDialog } from "./ComponentDialog";
import { ComponentsDialog } from "./ComponentsDialog";

const comp = (over: Partial<PayslipComponent>) =>
    ({
        id: "c1",
        householdId: "household",
        ownerId: "owner-1",
        name: "Basic Pay",
        kind: "earning",
        isVariable: 0,
        sortOrder: 0,
        archivedAt: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        ...over,
    }) as PayslipComponent;

const renderDialog = (component: PayslipComponent) =>
    render(
        <ComponentDialog
            ownerId="owner-1"
            component={component}
            onClose={vi.fn()}
        />
    );

beforeEach(() => {
    mocks.updateMutate.mockClear();
});

describe("ComponentsDialog", () => {
    it("lists the existing components, and opening one edits it", () => {
        render(
            <ComponentsDialog
                ownerId="owner-1"
                components={[
                    comp({ id: "c1", name: "Basic Pay" }),
                    comp({ id: "c2", name: "Income Tax", kind: "deduction" }),
                ]}
                onClose={vi.fn()}
            />
        );

        expect(screen.getByText("Income Tax")).toBeInTheDocument();
        fireEvent.click(screen.getByText("Basic Pay"));
        expect(screen.getByLabelText("Name")).toHaveValue("Basic Pay");
    });
});

describe("ComponentDialog", () => {
    it("saving persists name, kind and isVariable, not just the name", async () => {
        renderDialog(comp({ name: "Bonus", isVariable: 1 }));

        expect(screen.getByLabelText(/Variable pay/)).toBeChecked();
        fireEvent.change(screen.getByLabelText("Name"), {
            target: { value: "Annual Bonus" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() =>
            expect(mocks.updateMutate).toHaveBeenCalledWith({
                id: "c1",
                expectedUpdatedAt: new Date(0),
                name: "Annual Bonus",
                kind: "earning",
                isVariable: true,
            })
        );
    });

    it("does not offer Variable for a deduction, and saves it false", async () => {
        renderDialog(comp({ id: "c2", name: "Income Tax", kind: "deduction" }));

        expect(screen.queryByLabelText(/Variable pay/)).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() =>
            expect(mocks.updateMutate).toHaveBeenCalledWith({
                id: "c2",
                expectedUpdatedAt: new Date(0),
                name: "Income Tax",
                kind: "deduction",
                isVariable: false,
            })
        );
    });

    it("does not save when the name is cleared", async () => {
        renderDialog(comp({}));

        fireEvent.change(screen.getByLabelText("Name"), {
            target: { value: "   " },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));

        await Promise.resolve();
        expect(mocks.updateMutate).not.toHaveBeenCalled();
        expect(screen.getByText("Enter a component name.")).toBeInTheDocument();
    });
});
