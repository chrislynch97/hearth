import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stepper, type StepperStep } from "@/components/ui/Stepper";
import { FinishStep } from "@/setup/FinishStep";
import { HouseholdStep } from "@/setup/HouseholdStep";
import { MembersStep } from "@/setup/MembersStep";
import { RestoreBackupControl } from "@/setup/RestoreBackupControl";
import { YouStep } from "@/setup/YouStep";

export interface SetupWizardProps {
    householdName: string;
    currencyCode: string;
    locale: string;
}

const STEPS: StepperStep[] = [
    { label: "Household", description: "Name & currency" },
    { label: "You", description: "Your account" },
    { label: "Members", description: "Who else lives here?" },
    { label: "Finish", description: "Complete setup" },
];

export const SetupWizard = ({
    householdName,
    currencyCode,
    locale,
}: SetupWizardProps) => {
    const [active, setActive] = useState(0);

    return (
        <main className="hearth-ds min-h-dvh bg-bg text-base">
            <div className="mx-auto flex max-w-[640px] flex-col gap-6 px-4 py-8">
                <PageHeader
                    title="Set up Hearth"
                    actions={<RestoreBackupControl />}
                />
                <Stepper steps={STEPS} active={active} />
                {active === 0 && (
                    <HouseholdStep
                        initialName={householdName}
                        initialCurrencyCode={currencyCode}
                        initialLocale={locale}
                        onNext={() => setActive(1)}
                    />
                )}
                {active === 1 && (
                    <YouStep
                        onNext={() => setActive(2)}
                        onBack={() => setActive(0)}
                    />
                )}
                {active === 2 && (
                    <MembersStep
                        onNext={() => setActive(3)}
                        onBack={() => setActive(1)}
                    />
                )}
                {active === 3 && <FinishStep onBack={() => setActive(2)} />}
            </div>
        </main>
    );
};
