import { useState } from "react";
import { trpc } from "@/trpc";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { ChoiceField } from "@/components/ui/ChoiceField";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Notice } from "@/components/ui/Notice";
import { TextField } from "@/components/ui/TextField";
import { normalizeComponentDraft, type ComponentKind } from "../payslipDraft";
import type { PayslipComponent } from "../model";

const KINDS: Array<{ value: ComponentKind; label: string }> = [
    { value: "earning", label: "Earning" },
    { value: "deduction", label: "Deduction" },
    { value: "employer_info", label: "Employer info" },
];

export interface ComponentDialogProps {
    ownerId: string;
    /** Null adds a new component. */
    component: PayslipComponent | null;
    onClose: () => void;
}

/** One line that appears on a person's payslips. */
export const ComponentDialog = ({
    ownerId,
    component,
    onClose,
}: ComponentDialogProps) => {
    const utils = trpc.useUtils();
    const create = trpc.payslipComponents.create.useMutation();
    const update = trpc.payslipComponents.update.useMutation();
    const archive = trpc.payslipComponents.archive.useMutation();
    const [name, setName] = useState(component?.name ?? "");
    const [kind, setKind] = useState(
        (component?.kind ?? "earning") as ComponentKind
    );
    const [isVariable, setIsVariable] = useState(component?.isVariable === 1);
    const [error, setError] = useState("");

    const pending = create.isPending || update.isPending || archive.isPending;

    const refresh = () =>
        Promise.all([
            utils.payslipComponents.list.invalidate(),
            utils.income.overview.invalidate(),
        ]);

    const run = async (action: () => Promise<unknown>) => {
        setError("");
        try {
            await action();
            await refresh();
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save that.");
        }
    };

    const submit = () => {
        const draft = normalizeComponentDraft({ name, kind, isVariable });
        if (!draft) return setError("Enter a component name.");
        void run(() =>
            component
                ? update.mutateAsync({
                      id: component.id,
                      expectedUpdatedAt: component.updatedAt,
                      ...draft,
                  })
                : create.mutateAsync({ ownerId, ...draft })
        );
    };

    return (
        <ConfirmDialog
            open
            onOpenChange={(open) => !open && onClose()}
            title={component ? `Edit ${component.name}` : "Add component"}
            confirm={{
                label: component ? "Save" : "Add component",
                onClick: submit,
                pending,
            }}
            aside={
                component && (
                    <Button
                        variant="danger-outline"
                        disabled={pending}
                        onClick={() =>
                            void run(() =>
                                archive.mutateAsync({ id: component.id })
                            )
                        }
                    >
                        Remove
                    </Button>
                )
            }
        >
            <TextField
                label="Name"
                placeholder="e.g. Basic pay"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <ChoiceField
                label="Type"
                options={KINDS}
                value={kind}
                onChange={setKind}
            />
            {kind === "earning" && (
                <CheckboxField
                    checked={isVariable}
                    onCheckedChange={setIsVariable}
                    label="Variable pay"
                    description="For pay that changes month to month, like a bonus or overtime. It's left out of your regular monthly income, so a one-off doesn't inflate it."
                />
            )}
            {error && <Notice tone="danger" title={error} />}
        </ConfirmDialog>
    );
};
