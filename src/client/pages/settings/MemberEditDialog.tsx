import { useState } from "react";
import { PERSON_COLORS, personColor } from "@/personColor";
import { Button } from "@/components/ui/Button";
import { ChoiceField } from "@/components/ui/ChoiceField";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Notice } from "@/components/ui/Notice";
import { SwatchPicker } from "@/components/ui/SwatchPicker";
import { TextField } from "@/components/ui/TextField";

// Radix Select can't hold an empty value, so "no account" needs a stand-in.
const NO_ACCOUNT = "none";

export interface MemberEdit {
    displayName: string;
    color: string | null;
    userId: string | null;
}

export interface MemberEditDialogProps {
    member: MemberEdit & { kind: string };
    /** Accounts this member can be linked to; absent when the viewer can't. */
    accounts?: Array<{ value: string; label: string }>;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (edit: MemberEdit) => Promise<void>;
    onArchive: () => Promise<void>;
}

/** Name, colour and login for one member, saved together. Mounted per open so
 *  the fields always start from the member as it is now. */
export const MemberEditDialog = ({
    member,
    accounts,
    open,
    onOpenChange,
    onSave,
    onArchive,
}: MemberEditDialogProps) => {
    const [name, setName] = useState(member.displayName);
    const [color, setColor] = useState(member.color);
    const [userId, setUserId] = useState(member.userId);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");

    const person = member.kind === "person";

    const run = async (action: () => Promise<void>) => {
        setPending(true);
        setError("");
        try {
            await action();
            onOpenChange(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save.");
        } finally {
            setPending(false);
        }
    };

    const save = () =>
        void run(() => onSave({ displayName: name.trim(), color, userId }));

    return (
        <ConfirmDialog
            open={open}
            onOpenChange={onOpenChange}
            title={`Edit ${member.displayName}`}
            confirm={{
                label: "Save",
                onClick: save,
                pending,
                disabled: !name.trim(),
            }}
            aside={
                person && (
                    <Button
                        variant="danger-outline"
                        disabled={pending}
                        onClick={() => void run(onArchive)}
                    >
                        Archive
                    </Button>
                )
            }
        >
            <TextField
                label="Name"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && name.trim() && save()}
            />
            {person && (
                <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium text-text-secondary">
                        Colour
                    </p>
                    <SwatchPicker
                        label={`Colour for ${member.displayName}`}
                        swatches={PERSON_COLORS}
                        value={personColor(member.displayName, color)}
                        onChange={setColor}
                    />
                    <p className="text-sm text-text-muted">
                        Used for them in charts.
                    </p>
                </div>
            )}
            {person && accounts && (
                <ChoiceField
                    label="Account"
                    description="The login that belongs to this person."
                    options={[
                        { value: NO_ACCOUNT, label: "No account" },
                        ...accounts,
                    ]}
                    value={userId ?? NO_ACCOUNT}
                    onChange={(v) => setUserId(v === NO_ACCOUNT ? null : v)}
                />
            )}
            {error && <Notice tone="danger" title={error} />}
        </ConfirmDialog>
    );
};
