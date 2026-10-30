import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ListRow } from "@/components/ui/ListRow";
import type { PayslipComponent } from "../model";
import { ComponentDialog } from "./ComponentDialog";

const KIND_LABELS: Record<string, string> = {
    earning: "Earning",
    deduction: "Deduction",
    employer_info: "Employer info",
};

export interface ComponentsDialogProps {
    ownerId: string;
    components: PayslipComponent[];
    onClose: () => void;
}

/** The lines on a person's payslips. Opening one swaps this sheet for its
 *  editor, and closing the editor comes back here. */
export const ComponentsDialog = ({
    ownerId,
    components,
    onClose,
}: ComponentsDialogProps) => {
    // undefined is this list; null is a new component.
    const [editing, setEditing] = useState<PayslipComponent | null>();

    if (editing !== undefined) {
        return (
            <ComponentDialog
                ownerId={ownerId}
                component={editing}
                onClose={() => setEditing(undefined)}
            />
        );
    }

    return (
        <ConfirmDialog
            open
            onOpenChange={(open) => !open && onClose()}
            title="Payslip components"
            description="The earnings and deductions that appear on this person's payslip."
            confirm={{
                label: "Add component",
                onClick: () => setEditing(null),
            }}
        >
            {components.length > 0 && (
                <ul className="-mx-2 flex max-h-80 flex-col divide-y divide-border overflow-y-auto">
                    {components.map((c) => (
                        <ListRow
                            key={c.id}
                            title={c.name}
                            details={[
                                KIND_LABELS[c.kind] ?? c.kind,
                                c.isVariable === 1 && "Variable",
                            ]
                                .filter(Boolean)
                                .join(" · ")}
                            onClick={() => setEditing(c)}
                        />
                    ))}
                </ul>
            )}
        </ConfirmDialog>
    );
};
