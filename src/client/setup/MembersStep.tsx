import { useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/ui/Button";
import { FormFooter } from "@/components/ui/FormFooter";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import { PersonAvatar } from "@/layout/PersonAvatar";
import { StepCard } from "@/setup/StepCard";
import { trpc } from "@/trpc";

export interface MembersStepProps {
    onNext: () => void;
    onBack: () => void;
}

export const MembersStep = ({ onNext, onBack }: MembersStepProps) => {
    const utils = trpc.useUtils();
    const { data: members, isLoading } = trpc.members.list.useQuery();
    const { data: me } = trpc.users.me.useQuery();
    const addPerson = trpc.members.addPerson.useMutation({
        meta: { suppressErrorToast: true },
    });
    const archive = trpc.members.archive.useMutation();
    const [newName, setNewName] = useState("");
    const [addError, setAddError] = useState("");

    const activeMembers = (members ?? []).filter((m) => m.archivedAt === null);

    const handleAdd = async () => {
        const trimmed = newName.trim();
        if (!trimmed) {
            setAddError("Please enter a name.");
            return;
        }
        setAddError("");
        await addPerson.mutateAsync({ displayName: trimmed });
        await utils.members.list.invalidate();
        setNewName("");
    };

    const handleArchive = async (id: string) => {
        await archive.mutateAsync({ id });
        await utils.members.list.invalidate();
    };

    return (
        <StepCard
            title="Household members"
            description="Add anyone else who lives here — you're already on the list. The joint member represents shared finances and cannot be removed."
        >
            {isLoading && <Spinner label="Loading members" />}
            <ul className="flex flex-col divide-y divide-border">
                {activeMembers.map((m) => (
                    <li
                        key={m.id}
                        className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
                    >
                        <PersonAvatar name={m.displayName} color={m.color} />
                        <span className="min-w-0 truncate text-base font-medium text-text">
                            {m.displayName}
                        </span>
                        {m.kind === "joint" && (
                            <Badge variant="secondary">Joint</Badge>
                        )}
                        {m.userId === me?.id && (
                            <Badge variant="tint">You</Badge>
                        )}
                        {m.kind === "person" && m.userId !== me?.id && (
                            <Button
                                variant="danger"
                                compact
                                aria-label={`Remove ${m.displayName}`}
                                disabled={archive.isPending}
                                className="ml-auto size-7 px-0"
                                onClick={() => void handleArchive(m.id)}
                            >
                                <X />
                            </Button>
                        )}
                    </li>
                ))}
            </ul>
            <div className="flex items-start gap-2">
                <TextField
                    label="Add person"
                    hideLabel
                    value={newName}
                    onChange={(e) => {
                        setNewName(e.currentTarget.value);
                        setAddError("");
                    }}
                    placeholder="Their name"
                    error={addError || addPerson.error?.message}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") void handleAdd();
                    }}
                    className="min-w-0 flex-1"
                />
                <Button
                    className="h-9"
                    disabled={addPerson.isPending}
                    onClick={() => void handleAdd()}
                >
                    Add
                </Button>
            </div>
            <FormFooter aside={<Button onClick={onBack}>Back</Button>}>
                <Button
                    variant="solid"
                    className="max-sm:w-full"
                    onClick={onNext}
                >
                    Next
                </Button>
            </FormFooter>
        </StepCard>
    );
};
