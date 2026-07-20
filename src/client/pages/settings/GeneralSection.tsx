import { useState } from "react";
import {
    Alert,
    Button,
    Card,
    Group,
    Loader,
    NumberInput,
    Select,
    Stack,
    Text,
    TextInput,
    Title,
} from "@mantine/core";
import { trpc } from "@/trpc";
import { LOCALES } from "@/setup/locales";
import type { Household } from "../../../server/db/schema";
import { formatMoney } from "@shared/money";

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
    startDay: number | string;
    periodFrequency: string;
    periodAnchor: string;
    jointBasis: string;
    jointFundingModel: string;
    incomeBasis: string;
    decimalPlaces: number | string;
    symbolPosition: string;
    numberFormat: string;
    locale: string;
    weekStart: string;
    dateFormat: string;
    emergencyMonths: number | string;
}

const generalFormFrom = (hh: Household): GeneralForm => ({
    displayName: hh.displayName,
    currencySymbol: hh.currencySymbol,
    startDay: hh.budgetPeriodStartDay,
    periodFrequency: hh.budgetPeriodFrequency,
    periodAnchor: hh.budgetPeriodAnchor ?? "",
    jointBasis: hh.jointContributionBasis,
    jointFundingModel: hh.jointFundingModel,
    incomeBasis: hh.incomeBasisDefault,
    decimalPlaces: hh.currencyDecimalPlaces,
    symbolPosition: hh.currencySymbolPosition,
    numberFormat: numberFormatKey(
        hh.currencyGroupSeparator,
        hh.currencyDecimalSeparator
    ),
    locale: hh.locale,
    weekStart: hh.weekStart,
    dateFormat: hh.dateFormat,
    emergencyMonths: hh.emergencyFundMonths,
});

export const GeneralSection = () => {
    const utils = trpc.useUtils();
    const ctx = trpc.bootstrap.context.useQuery();
    const update = trpc.household.update.useMutation();
    const rescale = trpc.data.rescaleCurrency.useMutation();
    const hh = ctx.data?.household;

    // One form object: the household's values until edited, then the edits. `null`
    // until the household loads, so fields never flash blank defaults over real data.
    const [edits, setForm] = useState<GeneralForm | null>(null);
    const [saved, setSaved] = useState(false);

    const form = edits ?? (hh ? generalFormFrom(hh) : null);

    const set = <K extends keyof GeneralForm>(key: K, value: GeneralForm[K]) =>
        setForm(form ? { ...form, [key]: value } : form);

    const selectedFormat =
        NUMBER_FORMATS.find((f) => f.value === form?.numberFormat) ??
        NUMBER_FORMATS[0];

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
                    : form.periodAnchor ||
                      new Date().toISOString().slice(0, 10),
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
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    if (!form) {
        return (
            <Card withBorder padding="md" radius="md">
                <Loader size="sm" />
            </Card>
        );
    }

    return (
        <Card withBorder padding="md" radius="md">
            <Title order={4} mb="sm">
                General
            </Title>
            <Stack gap="sm">
                <Group grow>
                    <TextInput
                        label="Household name"
                        value={form.displayName}
                        onChange={(e) =>
                            set("displayName", e.currentTarget.value)
                        }
                    />
                    <TextInput
                        label="Currency symbol"
                        value={form.currencySymbol}
                        onChange={(e) =>
                            set("currencySymbol", e.currentTarget.value)
                        }
                        w={120}
                    />
                </Group>
                <Group grow align="flex-start">
                    <Select
                        label="Budget period"
                        description="How your pay cycle is split into budget periods."
                        data={[
                            { value: "monthly", label: "Monthly" },
                            { value: "four_weekly", label: "Every 4 weeks" },
                            {
                                value: "fortnightly",
                                label: "Fortnightly (2 weeks)",
                            },
                            { value: "weekly", label: "Weekly" },
                        ]}
                        value={form.periodFrequency}
                        onChange={(v) => {
                            const next = v ?? "monthly";
                            set("periodFrequency", next);
                            // A weekly cycle needs a reference start date — seed today if unset.
                            if (next !== "monthly" && !form.periodAnchor) {
                                set(
                                    "periodAnchor",
                                    new Date().toISOString().slice(0, 10)
                                );
                            }
                        }}
                        allowDeselect={false}
                    />
                    {form.periodFrequency === "monthly" ? (
                        <NumberInput
                            label="Starts on day"
                            description="Day of the month the period begins."
                            min={1}
                            max={28}
                            value={form.startDay}
                            onChange={(v) => set("startDay", v)}
                        />
                    ) : (
                        <TextInput
                            type="date"
                            label="First period starts"
                            description="Anchor date; periods repeat from here."
                            value={form.periodAnchor}
                            onChange={(e) =>
                                set("periodAnchor", e.currentTarget.value)
                            }
                        />
                    )}
                </Group>
                <Group grow>
                    <NumberInput
                        label="Currency decimal places"
                        description="Changing this rescales all stored amounts"
                        min={0}
                        max={4}
                        value={form.decimalPlaces}
                        onChange={(v) => set("decimalPlaces", v)}
                    />
                    <div />
                </Group>
                <Group grow align="flex-end">
                    <Select
                        label="Currency symbol position"
                        data={[
                            {
                                value: "prefix",
                                label: `Before (${form.currencySymbol || "£"}100)`,
                            },
                            {
                                value: "suffix",
                                label: `After (100 ${form.currencySymbol || "£"})`,
                            },
                        ]}
                        value={form.symbolPosition}
                        onChange={(v) => set("symbolPosition", v ?? "prefix")}
                        allowDeselect={false}
                    />
                    <Select
                        label="Number format"
                        data={NUMBER_FORMATS.map((f) => ({
                            value: f.value,
                            label: f.label,
                        }))}
                        value={form.numberFormat}
                        onChange={(v) => set("numberFormat", v ?? "comma_dot")}
                        allowDeselect={false}
                    />
                </Group>
                <Text size="xs" c="dimmed">
                    Preview:{" "}
                    <Text span ff="monospace" fz="sm" fw={500}>
                        {formatMoney(123456, {
                            symbol: form.currencySymbol || "£",
                            decimalPlaces: Number(form.decimalPlaces) || 0,
                            symbolPosition: form.symbolPosition as
                                "prefix" | "suffix",
                            groupSeparator: selectedFormat.group,
                            decimalSeparator: selectedFormat.decimal,
                        })}
                    </Text>
                </Text>
                <Group grow>
                    <Select
                        label="Joint funding model"
                        description={
                            form.jointFundingModel === "pooled"
                                ? "Each person contributes their whole remainder into a joint pool that covers joint costs."
                                : "Joint costs are split per person by the contribution basis."
                        }
                        data={[
                            { value: "split", label: "Split joint costs" },
                            { value: "pooled", label: "Pool remainders" },
                        ]}
                        value={form.jointFundingModel}
                        onChange={(v) => set("jointFundingModel", v ?? "split")}
                        allowDeselect={false}
                    />
                    <Select
                        label="Joint contribution basis"
                        description={
                            form.jointFundingModel === "pooled"
                                ? "Not used when remainders are pooled."
                                : undefined
                        }
                        data={[
                            { value: "equal", label: "Equal" },
                            {
                                value: "income_proportional",
                                label: "Income proportional",
                            },
                            { value: "custom", label: "Custom weights" },
                        ]}
                        value={form.jointBasis}
                        onChange={(v) => set("jointBasis", v ?? "equal")}
                        disabled={form.jointFundingModel === "pooled"}
                        allowDeselect={false}
                    />
                    <Select
                        label="Income basis"
                        data={[
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
                        onChange={(v) => set("incomeBasis", v ?? "regular_net")}
                        allowDeselect={false}
                    />
                </Group>
                <Group grow>
                    <Select
                        label="Region"
                        description="Sets how dates are shown (numeric day/month order and month names)."
                        data={LOCALES}
                        value={form.locale}
                        searchable
                        onChange={(v) => set("locale", v ?? "en-GB")}
                        allowDeselect={false}
                    />
                    <div />
                </Group>
                <Group grow>
                    <Select
                        label="Week starts on"
                        data={[
                            { value: "monday", label: "Monday" },
                            { value: "sunday", label: "Sunday" },
                        ]}
                        value={form.weekStart}
                        onChange={(v) => set("weekStart", v ?? "monday")}
                        allowDeselect={false}
                    />
                    <Select
                        label="Date format"
                        data={[
                            { value: "medium", label: "Medium (4 Jul 2026)" },
                            { value: "long", label: "Long (4 July 2026)" },
                            { value: "numeric", label: "Numeric (04/07/2026)" },
                            { value: "iso", label: "ISO (2026-07-04)" },
                        ]}
                        value={form.dateFormat}
                        onChange={(v) => set("dateFormat", v ?? "medium")}
                        allowDeselect={false}
                    />
                </Group>
                <Group grow>
                    <NumberInput
                        label="Emergency fund (months of bills)"
                        description="Target cushion shown on the Funding page — typically 3–6 months."
                        min={0}
                        max={24}
                        value={form.emergencyMonths}
                        onChange={(v) => set("emergencyMonths", v)}
                    />
                    <div />
                </Group>
                {(update.error || rescale.error) && (
                    <Alert color="red" title="Error">
                        {update.error?.message || rescale.error?.message}
                    </Alert>
                )}
                <Group justify="flex-end">
                    {saved && (
                        <Text size="sm" c="dimmed">
                            Saved ✓
                        </Text>
                    )}
                    <Button
                        onClick={() => void handleSave()}
                        loading={update.isPending || rescale.isPending}
                    >
                        Save changes
                    </Button>
                </Group>
            </Stack>
        </Card>
    );
};
