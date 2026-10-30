import { useState } from "react";
import { trpc } from "@/trpc";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SettingsRow } from "@/components/ui/SettingsRow";

/** Wipe the instance back to the setup wizard. A row in the System danger zone. */
export const ResetAllData = () => {
    const resetMut = trpc.data.reset.useMutation();

    const [confirming, setConfirming] = useState(false);

    const handleReset = async () => {
        await resetMut.mutateAsync();
        // Fresh household → app returns to the setup wizard.
        window.location.href = "/";
    };

    return (
        <>
            <SettingsRow
                title="Reset all data"
                danger
                description="Wipe everything and start fresh from the setup wizard."
            >
                <Button variant="danger" onClick={() => setConfirming(true)}>
                    Reset
                </Button>
            </SettingsRow>
            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title="Reset all data?"
                description="This permanently deletes every member, pot, outgoing, spend, payslip and raise, and returns to the setup wizard. Consider downloading a backup first."
                tone="danger"
                confirm={{
                    label: "Reset everything",
                    onClick: () => void handleReset(),
                    pending: resetMut.isPending,
                }}
            />
        </>
    );
};
