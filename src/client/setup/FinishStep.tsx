import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormFooter } from "@/components/ui/FormFooter";
import { Notice } from "@/components/ui/Notice";
import { PersonAvatar } from "@/layout/PersonAvatar";
import { StepCard } from "@/setup/StepCard";
import { trpc } from "@/trpc";

export interface FinishStepProps {
    onBack: () => void;
}

export const FinishStep = ({ onBack }: FinishStepProps) => {
    const utils = trpc.useUtils();
    const { data: members } = trpc.members.list.useQuery();
    const { data: me } = trpc.users.me.useQuery();
    // Read the (possibly just-renamed) household name from live data rather than a
    // stale prop threaded down from the wizard's initial props.
    const { data: context } = trpc.bootstrap.context.useQuery();
    const completeSetup = trpc.household.completeSetup.useMutation({
        meta: { suppressErrorToast: true },
    });
    const [error, setError] = useState("");

    const householdName = context?.household?.displayName ?? "Your household";
    const activeMembers = (members ?? []).filter((m) => m.archivedAt === null);
    const people = activeMembers.filter((m) => m.kind === "person").length;

    const handleFinish = async () => {
        setError("");
        try {
            await completeSetup.mutateAsync();
            await utils.bootstrap.context.invalidate();
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Setup could not be completed."
            );
        }
    };

    return (
        <StepCard
            title="Ready to go!"
            description={
                <>
                    <strong className="font-semibold text-text">
                        {householdName}
                    </strong>{" "}
                    is configured with {people}{" "}
                    {people === 1 ? "person" : "people"}.
                </>
            }
        >
            <ul className="flex flex-col gap-2">
                {activeMembers.map((m) => (
                    <li key={m.id} className="flex items-center gap-3">
                        <PersonAvatar name={m.displayName} color={m.color} />
                        <span className="min-w-0 text-base text-text">
                            {m.displayName}
                            {m.kind === "joint" ? " (joint)" : ""}
                            {m.userId === me?.id
                                ? ` — signed in as ${me.username}`
                                : ""}
                        </span>
                    </li>
                ))}
            </ul>
            {error && (
                <Notice tone="danger" title="Setup incomplete">
                    {error} — please go back and add at least one person.
                </Notice>
            )}
            <FormFooter aside={<Button onClick={onBack}>Back</Button>}>
                <Button
                    variant="solid"
                    disabled={completeSetup.isPending}
                    className="max-sm:w-full"
                    onClick={() => void handleFinish()}
                >
                    Finish setup
                </Button>
            </FormFooter>
        </StepCard>
    );
};
