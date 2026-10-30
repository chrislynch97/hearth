import { useState } from "react";
import { AuthForm } from "@/AuthForm";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { FormFooter } from "@/components/ui/FormFooter";
import { Notice } from "@/components/ui/Notice";
import { TextField } from "@/components/ui/TextField";
import { CURRENCIES, findCurrency } from "@/setup/currencies";
import { LOCALES } from "@/setup/locales";
import { StepCard } from "@/setup/StepCard";
import { trpc } from "@/trpc";

export interface HouseholdStepProps {
    initialName: string;
    initialCurrencyCode: string;
    initialLocale: string;
    onNext: () => void;
}

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({
    value: c.code,
    label: c.label,
}));

export const HouseholdStep = ({
    initialName,
    initialCurrencyCode,
    initialLocale,
    onNext,
}: HouseholdStepProps) => {
    const [name, setName] = useState(initialName);
    const [currencyCode, setCurrencyCode] = useState(initialCurrencyCode);
    const [locale, setLocale] = useState(initialLocale);
    const updateHousehold = trpc.household.update.useMutation({
        meta: { suppressErrorToast: true },
    });

    const handleNext = async () => {
        const preset = findCurrency(currencyCode);
        await updateHousehold.mutateAsync({
            displayName: name.trim() || "My Household",
            currencyCode,
            currencySymbol: preset?.symbol ?? "£",
            currencyDecimalPlaces: preset?.decimalPlaces ?? 2,
            locale,
        });
        onNext();
    };

    return (
        <StepCard title="About your household">
            <AuthForm onSubmit={() => void handleNext()}>
                <TextField
                    label="Household name"
                    value={name}
                    onChange={(e) => setName(e.currentTarget.value)}
                    placeholder="My Household"
                />
                <Combobox
                    label="Currency"
                    options={CURRENCY_OPTIONS}
                    value={currencyCode}
                    onChange={(v) => setCurrencyCode(v ?? "GBP")}
                    placeholder="Choose a currency"
                />
                <Combobox
                    label="Region"
                    description="Sets how dates are shown (numeric day/month order and month names)."
                    options={LOCALES}
                    value={locale}
                    onChange={(v) => setLocale(v ?? "en-GB")}
                    placeholder="Choose a region"
                />
                {updateHousehold.error && (
                    <Notice tone="danger" title="Couldn't save that">
                        {updateHousehold.error.message}
                    </Notice>
                )}
                <FormFooter>
                    <Button
                        type="submit"
                        variant="solid"
                        disabled={updateHousehold.isPending}
                        className="max-sm:w-full"
                    >
                        Next
                    </Button>
                </FormFooter>
            </AuthForm>
        </StepCard>
    );
};
