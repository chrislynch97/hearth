import { useState } from "react";
import { trpc } from "@/trpc";
import { LOCALES } from "@/setup/locales";
import { formatMoney } from "@shared/money";
import { useFlash } from "@/hooks/useFlash";
import { ChoiceField } from "@/components/ui/ChoiceField";
import { SaveBar } from "@/components/ui/SaveBar";
import { SettingsSection } from "@/components/ui/SettingsSection";
import { Spinner } from "@/components/ui/Spinner";
import { TextField } from "@/components/ui/TextField";
import type { Household } from "../../../server/db/schema";

// Thousands/decimal separator presets. Stored as two explicit characters on the
// household so a Euro household can pick the German 1.234,56 shape; the key here
// is only for the Settings dropdown.
const NUMBER_FORMATS = [
    { value: "comma_dot", group: ",", decimal: ".", label: "1,234.56" },
    { value: "dot_comma", group: ".", decimal: ",", label: "1.234,56" },
    { value: "space_comma", group: " ", decimal: ",", label: "1 234,56" },
    { value: "none_dot", group: "", decimal: ".", label: "1234.56" },
] as const;

const numberFormatKey = (group: string, decimal: string): string =>
    NUMBER_FORMATS.find((f) => f.group === group && f.decimal === decimal)
        ?.value ?? "comma_dot";

// The editable household fields as one object, so seeding from the query is a
// single assignment (no per-field copy line to forget) and adding a field can't
// silently render blank or get wiped on save.
interface GeneralForm {
    displayName: string;
    currencySymbol: string;
    startDay: string;
    periodFrequency: string;
    periodAnchor: string;
    jointBasis: string;
    jointFundingModel: string;
    incomeBasis: string;
    decimalPlaces: string;
    symbolPosition: string;
    numberFormat: string;
    locale: string;
    weekStart: string;
    dateFormat: string;
    emergencyMonths: string;
}

const generalFormFrom = (hh: Household): GeneralForm => ({
    displayName: hh.displayName,
    currencySymbol: hh.currencySymbol,
    startDay: String(hh.budgetPeriodStartDay),
    periodFrequency: hh.budgetPeriodFrequency,
    periodAnchor: hh.budgetPeriodAnchor ?? "",
    jointBasis: hh.jointContributionBasis,
    jointFundingModel: hh.jointFundingModel,
    incomeBasis: hh.incomeBasisDefault,
    decimalPlaces: String(hh.currencyDecimalPlaces),
    symbolPosition: hh.currencySymbolPosition,
    numberFormat: numberFormatKey(
        hh.currencyGroupSeparator,
        hh.currencyDecimalSeparator
    ),
    locale: hh.locale,
    weekStart: hh.weekStart,
    dateFormat: hh.dateFormat,
    emergencyMonths: String(hh.emergencyFundMonths),
});

const today = () => new Date().toISOString().slice(0, 10);

/** The household's own settings, in themed sections that share one save. */
export const GeneralSection = () => {
    const utils = trpc.useUtils();
    const ctx = trpc.bootstrap.context.useQuery();
    const update = trpc.household.update.useMutation();
    const rescale = trpc.data.rescaleCurrency.useMutation();

    // The household's values until edited, then the edits. `null` until the
    // household loads, so fields never flash blank defaults over real data.
    const [edits, setForm] = useState<GeneralForm | null>(null);
    const [saved, flashSaved] = useFlash(3000);

    const hh = ctx.data?.household;
    const form = edits ?? (hh ? generalFormFrom(hh) : null);
    const selectedFormat =
        NUMBER_FORMATS.find((f) => f.value === form?.numberFormat) ??
        NUMBER_FORMATS[0];

    const set = <K extends keyof GeneralForm>(key: K, value: GeneralForm[K]) =>
        setForm(form ? { ...form, [key]: value } : form);

    const handleSave = async () => {
        if (!form) return;
        await update.mutateAsync({
            displayName: form.displayName.trim() || undefined,
            currencySymbol: form.currencySymbol || undefined,
            currencySymbolPosition: form.symbolPosition as "prefix" | "suffix",
            currencyGroupSeparator: selectedFormat.group,
            currencyDecimalSeparator: selectedFormat.decimal,
            budgetPeriodStartDay: Number(form.startDay),
            budgetPeriodFrequency: form.periodFrequency as
                "monthly" | "four_weekly" | "fortnightly" | "weekly",
            // Anchor only matters for the weekly cycles; clear it for monthly. Fall back
            // to today if a non-monthly cycle was picked without choosing a start date.
            budgetPeriodAnchor:
                form.periodFrequency === "monthly"
                    ? null
                    : form.periodAnchor || today(),
            jointContributionBasis: form.jointBasis as
                "equal" | "income_proportional" | "custom",
            jointFundingModel: form.jointFundingModel as "split" | "pooled",
            incomeBasisDefault: form.incomeBasis as
                "regular_net" | "latest_payslip" | "rolling_12m",
            locale: form.locale,
            weekStart: form.weekStart as "monday" | "sunday",
            dateFormat: form.dateFormat as
                "iso" | "numeric" | "medium" | "long",
            emergencyFundMonths: Number(form.emergencyMonths),
        });
        // Currency decimal-places change rescales every money column, so it goes
        // through the dedicated endpoint.
        if (hh && Number(form.decimalPlaces) !== hh.currencyDecimalPlaces) {
            await rescale.mutateAsync({
                decimalPlaces: Number(form.decimalPlaces),
            });
        }
        await utils.invalidate();
        setForm(null);
        flashSaved();
    };

    if (!form) return <Spinner label="Loading household settings" />;

    const symbol = form.currencySymbol || "£";
    const pooled = form.jointFundingModel === "pooled";

    return (
        <>
            <SettingsSection
                title="Household"
                description="The name everyone in it sees."
            >
                <TextField
                    label="Household name"
                    value={form.displayName}
                    onChange={(e) => set("displayName", e.currentTarget.value)}
                />
            </SettingsSection>

            <SettingsSection
                title="Budget period"
                description="How your pay cycle is split into periods. Plans, funding and the Overview all work a period at a time."
            >
                <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
                    <ChoiceField
                        label="Budget period"
                        options={[
                            { value: "monthly", label: "Monthly" },
                            { value: "four_weekly", label: "Every 4 weeks" },
                            {
                                value: "fortnightly",
                                label: "Fortnightly (2 weeks)",
                            },
                            { value: "weekly", label: "Weekly" },
                        ]}
                        value={form.periodFrequency}
                        onChange={(next) =>
                            // A weekly cycle needs a reference start date —
                            // seed today if unset.
                            setForm({
                                ...form,
                                periodFrequency: next,
                                periodAnchor:
                                    next !== "monthly" && !form.periodAnchor
                                        ? today()
                                        : form.periodAnchor,
                            })
                        }
                    />
                    {form.periodFrequency === "monthly" ? (
                        <TextField
                            label="Starts on day"
                            description="Day of the month the period begins (1–28)."
                            type="number"
                            min={1}
                            max={28}
                            value={form.startDay}
                            onChange={(e) =>
                                set("startDay", e.currentTarget.value)
                            }
                        />
                    ) : (
                        <TextField
                            label="First period starts"
                            description="Periods repeat from this date."
                            type="date"
                            value={form.periodAnchor}
                            onChange={(e) =>
                                set("periodAnchor", e.currentTarget.value)
                            }
                        />
                    )}
                </div>
                <TextField
                    label="Emergency fund (months of bills)"
                    description="Target cushion shown on the Funding page — typically 3–6 months."
                    type="number"
                    min={0}
                    max={24}
                    value={form.emergencyMonths}
                    onChange={(e) =>
                        set("emergencyMonths", e.currentTarget.value)
                    }
                    className="sm:max-w-[50%]"
                />
            </SettingsSection>

            <SettingsSection
                title="Money format"
                description={
                    <>
                        How amounts are written everywhere. Preview:{" "}
                        <span className="tabular font-semibold text-text">
                            {formatMoney(123456, {
                                symbol,
                                decimalPlaces: Number(form.decimalPlaces) || 0,
                                symbolPosition: form.symbolPosition as
                                    "prefix" | "suffix",
                                groupSeparator: selectedFormat.group,
                                decimalSeparator: selectedFormat.decimal,
                            })}
                        </span>
                    </>
                }
            >
                <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
                    <TextField
                        label="Currency symbol"
                        value={form.currencySymbol}
                        onChange={(e) =>
                            set("currencySymbol", e.currentTarget.value)
                        }
                    />
                    <ChoiceField
                        label="Currency symbol position"
                        options={[
                            { value: "prefix", label: `Before (${symbol}100)` },
                            { value: "suffix", label: `After (100 ${symbol})` },
                        ]}
                        value={form.symbolPosition}
                        onChange={(v) => set("symbolPosition", v)}
                    />
                    <ChoiceField
                        label="Number format"
                        options={NUMBER_FORMATS}
                        value={form.numberFormat}
                        onChange={(v) => set("numberFormat", v)}
                    />
                    <TextField
                        label="Currency decimal places"
                        description="Changing this rescales every stored amount."
                        type="number"
                        min={0}
                        max={4}
                        value={form.decimalPlaces}
                        onChange={(e) =>
                            set("decimalPlaces", e.currentTarget.value)
                        }
                    />
                </div>
            </SettingsSection>

            <SettingsSection
                title="Joint costs"
                description="How shared bills are funded between the people in the household."
            >
                <ChoiceField
                    label="Joint funding model"
                    description={
                        pooled
                            ? "Each person contributes their whole remainder into a joint pool that covers joint costs."
                            : "Joint costs are split per person by the contribution basis."
                    }
                    options={[
                        { value: "split", label: "Split joint costs" },
                        { value: "pooled", label: "Pool remainders" },
                    ]}
                    value={form.jointFundingModel}
                    onChange={(v) => set("jointFundingModel", v)}
                />
                <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
                    <ChoiceField
                        label="Joint contribution basis"
                        description={
                            pooled
                                ? "Not used when remainders are pooled."
                                : undefined
                        }
                        options={[
                            { value: "equal", label: "Equal" },
                            {
                                value: "income_proportional",
                                label: "Income proportional",
                            },
                            { value: "custom", label: "Custom weights" },
                        ]}
                        value={form.jointBasis}
                        onChange={(v) => set("jointBasis", v)}
                        disabled={pooled}
                    />
                    <ChoiceField
                        label="Income basis"
                        options={[
                            {
                                value: "regular_net",
                                label: "Regular net (salary)",
                            },
                            {
                                value: "latest_payslip",
                                label: "Latest payslip",
                            },
                            {
                                value: "rolling_12m",
                                label: "Rolling 12 months",
                            },
                        ]}
                        value={form.incomeBasis}
                        onChange={(v) => set("incomeBasis", v)}
                    />
                </div>
            </SettingsSection>

            <SettingsSection
                title="Dates"
                description="How dates are written and which day a week starts on."
            >
                <ChoiceField
                    label="Region"
                    description="Sets the day/month order and month names."
                    options={LOCALES}
                    value={form.locale}
                    onChange={(v) => set("locale", v)}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                    <ChoiceField
                        label="Week starts on"
                        options={[
                            { value: "monday", label: "Monday" },
                            { value: "sunday", label: "Sunday" },
                        ]}
                        value={form.weekStart}
                        onChange={(v) => set("weekStart", v)}
                    />
                    <ChoiceField
                        label="Date format"
                        options={[
                            { value: "medium", label: "Medium (4 Jul 2026)" },
                            { value: "long", label: "Long (4 July 2026)" },
                            { value: "numeric", label: "Numeric (04/07/2026)" },
                            { value: "iso", label: "ISO (2026-07-04)" },
                        ]}
                        value={form.dateFormat}
                        onChange={(v) => set("dateFormat", v)}
                    />
                </div>
            </SettingsSection>

            <SaveBar
                dirty={edits !== null}
                saved={saved}
                saving={update.isPending || rescale.isPending}
                error={update.error?.message || rescale.error?.message}
                onSave={() => void handleSave()}
                onDiscard={() => setForm(null)}
            />
        </>
    );
};
