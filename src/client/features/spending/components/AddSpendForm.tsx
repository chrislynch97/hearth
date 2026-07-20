import { type MoneyFormat, useFirstDayOfWeek } from "@/useMoney";
import type { Member, Pot } from "../../../../server/db/schema";
import { trpc } from "@/trpc";
import { orderMembers } from "@/potOptions";
import { useState } from "react";
import { todayIso } from "@shared/dates";
import { formatMoney, fromMinor, toMinor } from "@shared/money";
import {
    Alert,
    Button,
    Card,
    Group,
    NumberInput,
    SegmentedControl,
    Select,
    Stack,
    Text,
    TextInput,
    Title,
} from "@mantine/core";
import { SpendFundingFields } from "@/features/spending/components/SpendFundingFields";
import { annualise, type Recurrence } from "@shared/recurrence";
import { DatePickerInput } from "@mantine/dates";

export const dueLabel = (daysUntil: number): string => {
    if (daysUntil === 0) return "due today";
    if (daysUntil > 0) return `due in ${daysUntil}d`;
    return `due ${-daysUntil}d ago`;
};

export interface AddSpendFormProps {
    members: Member[];
    pots: Pot[];
    money: MoneyFormat;
}

export const AddSpendForm = ({ members, pots, money }: AddSpendFormProps) => {
    const utils = trpc.useUtils();
    const firstDayOfWeek = useFirstDayOfWeek();
    const add = trpc.spends.add.useMutation();
    const updateExpense = trpc.expenses.update.useMutation();
    const outgoingsQuery = trpc.plan.recentlyDue.useQuery();
    const categories = trpc.categories.list.useQuery().data ?? [];

    const orderedMembers = orderMembers(members);
    const [amountMajor, setAmountMajor] = useState<string>("");
    const [kind, setKind] = useState<"spend" | "refund">("spend");
    const [description, setDescription] = useState("");
    const [date, setDate] = useState<string | null>(todayIso());
    // Owner = who *paid* (the person to repay). The pot it draws from is chosen
    // independently now, so we never filter pots by owner.
    const [ownerId, setOwnerId] = useState<string | null>(
        orderedMembers[0]?.id ?? null
    );
    const [chosenPotId, setChosenPotId] = useState<string | null>(null);
    const [potManuallyChosen, setPotManuallyChosen] = useState(false);
    // "Already came out / no transfer needed" — auto-pot deduction or main account.
    const [settledAtSource, setSettledAtSource] = useState(false);
    // Category carried from a main-account bill prefill (recorded when there's no pot).
    const [categoryId, setCategoryId] = useState<string | null>(null);
    // The bill this entry was prefilled from (drives the "update it going forward?" prompt).
    const [outgoingKey, setOutgoingKey] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    const [pendingUpdate, setPendingUpdate] = useState<null | {
        expenseId: string;
        name: string;
        from: number;
        to: number;
        amount: number;
        recurrence: Recurrence;
        effectiveDate: string;
        // Carried so the confirmation can name the pot whose standing order this
        // change makes stale (issue #69).
        funding: "pot_manual" | "pot_auto" | "main";
        potId: string | null;
    }>(null);

    const outgoings = outgoingsQuery.data ?? [];
    const selectedOutgoing =
        outgoings.find((o) => o.key === outgoingKey) ?? null;

    const suggestQuery = trpc.spends.suggestPot.useQuery(
        { description: description.trim(), ownerId: ownerId ?? "" },
        { enabled: description.trim().length > 0 && !!ownerId }
    );

    // Until the funding is chosen explicitly, the pot follows the description-based
    // suggestion — ignoring one that names a pot this form can't offer.
    const suggested = suggestQuery.data?.potId ?? null;
    const validSuggestion = pots.some((p) => p.id === suggested)
        ? suggested
        : null;
    const potId = potManuallyChosen ? chosenPotId : validSuggestion;

    const potById = new Map(pots.map((p) => [p.id, p]));

    function resetForm(keepOwner: string | null, keepDate: string | null) {
        setAmountMajor("");
        setKind("spend");
        setDescription("");
        setDate(keepDate);
        setChosenPotId(null);
        setPotManuallyChosen(false);
        setSettledAtSource(false);
        setCategoryId(null);
        setOutgoingKey(null);
        setError("");
        setOwnerId(keepOwner);
    }

    // Prefill the form from a recently-due bill. A bill is single-pot now, so it
    // maps straight onto one spend; its funding decides whether the spend is
    // settled at source (auto-pot / main account → no catch-up).
    function selectOutgoing(key: string | null) {
        setOutgoingKey(key);
        setError("");
        setSuccessMessage("");
        if (!key) {
            setSettledAtSource(false);
            setCategoryId(null);
            return;
        }
        const o = outgoings.find((x) => x.key === key);
        if (!o) return;
        setDescription(o.name);
        setDate(o.date);
        setKind("spend");
        setChosenPotId(o.potId);
        setCategoryId(o.categoryId);
        setSettledAtSource(o.settledAtSource);
        setAmountMajor(String(fromMinor(o.totalAmount, money.decimalPlaces)));
        // Picking a bill is an explicit pot choice; don't let the description
        // suggestion overwrite it.
        setPotManuallyChosen(true);
    }

    async function handleSubmit() {
        const trimmedDescription = description.trim();
        if (!trimmedDescription) {
            setError("Please enter a description.");
            return;
        }
        if (!ownerId) {
            setError("Please choose who this is for.");
            return;
        }
        const majorValue = Number(amountMajor);
        if (amountMajor === "" || Number.isNaN(majorValue) || majorValue <= 0) {
            setError("Please enter an amount greater than zero.");
            return;
        }
        setError("");
        setSuccessMessage("");

        const minor = toMinor(majorValue, money.decimalPlaces);
        const amount = kind === "refund" ? -minor : minor;

        const inserted = await add.mutateAsync({
            date: date ?? undefined,
            description: trimmedDescription,
            amount,
            ownerId,
            potId: potId || null,
            categoryId: potId ? null : categoryId,
            expenseId: selectedOutgoing?.expenseId ?? null,
            settledAtSource,
        });

        await Promise.all([
            utils.spends.list.invalidate(),
            utils.reconcile.backlog.invalidate(),
        ]);

        // If this was logged from a bill and the amount differs, offer to update the
        // bill going forward. (Refunds never redefine an expected cost.)
        let nextUpdate: typeof pendingUpdate = null;
        if (
            kind === "spend" &&
            selectedOutgoing &&
            minor !== selectedOutgoing.totalAmount
        ) {
            nextUpdate = {
                expenseId: selectedOutgoing.expenseId,
                name: selectedOutgoing.name,
                from: selectedOutgoing.totalAmount,
                to: minor,
                amount: minor,
                recurrence: selectedOutgoing.recurrence,
                // The change took effect on the day of the spend that revealed it.
                effectiveDate: date ?? todayIso(),
                funding: selectedOutgoing.funding,
                potId: selectedOutgoing.potId,
            };
        }
        setPendingUpdate(nextUpdate);

        const potName = inserted.potId
            ? potById.get(inserted.potId)?.name
            : null;
        setSuccessMessage(
            settledAtSource
                ? `Logged ${formatMoney(Math.abs(inserted.amount), money)} — already settled, no catch-up needed`
                : `Logged ${formatMoney(Math.abs(inserted.amount), money)}${potName ? ` — take from ${potName}` : " — needs a pot"}`
        );

        // Carry the date across submits: consecutive entries are usually the same
        // past day's receipts (see issue #65), just like the owner is carried.
        resetForm(ownerId, date);
    }

    async function applyOutgoingUpdate() {
        if (!pendingUpdate) return;
        // No optimistic-lock guard here: this "update the bill going forward" prompt
        // is driven by a plan projection that doesn't carry the bill's updatedAt, so
        // it stays last-write-wins (see issue #23). The bill edit form is guarded.
        await updateExpense.mutateAsync({
            id: pendingUpdate.expenseId,
            amount: pendingUpdate.amount,
            priceSource: "spend_prompt",
            priceEffectiveDate: pendingUpdate.effectiveDate,
        });
        await Promise.all([
            utils.plan.recentlyDue.invalidate(),
            utils.plan.upcoming.invalidate(),
            utils.plan.funding.invalidate(),
            utils.expenses.list.invalidate(),
            utils.standingOrders.alerts.invalidate(),
        ]);

        // Surface the standing-order impact here — the moment to act on it (issue
        // #69). Only pot_manual bills have a standing order to update.
        let standingOrderLine = "";
        if (pendingUpdate.funding === "pot_manual" && pendingUpdate.potId) {
            const alerts = await utils.standingOrders.alerts.fetch();
            const alert = alerts.find((a) => a.potId === pendingUpdate.potId);
            if (alert) {
                standingOrderLine = ` ${alert.potName} standing order: ${formatMoney(alert.wasMonthly, money)}/mo → ${formatMoney(alert.nowMonthly, money)}/mo.`;
            }
        }

        setPendingUpdate(null);
        setSuccessMessage(
            `Updated ${pendingUpdate.name} going forward.${standingOrderLine}`
        );
    }

    return (
        <Card withBorder padding="md">
            <Stack gap="sm">
                <Title order={4}>Add spending</Title>
                {outgoings.length > 0 && (
                    <Select
                        label="Log a regular outgoing"
                        placeholder="Search recent bills to prefill…"
                        data={outgoings.map((o) => ({
                            value: o.key,
                            label: `${o.name} · ${formatMoney(o.totalAmount, money)} · ${dueLabel(o.daysUntil)}`,
                        }))}
                        value={outgoingKey}
                        searchable
                        clearable
                        onChange={selectOutgoing}
                    />
                )}
                <Group grow align="flex-end" wrap="wrap">
                    <NumberInput
                        label="Amount"
                        placeholder="0.00"
                        decimalScale={money.decimalPlaces}
                        fixedDecimalScale
                        min={0}
                        value={amountMajor}
                        onChange={(v) =>
                            setAmountMajor(v === "" ? "" : String(v))
                        }
                        leftSection={<Text size="sm">{money.symbol}</Text>}
                    />
                    <DatePickerInput
                        label="Date"
                        value={date}
                        onChange={setDate}
                        valueFormat="DD MMM YYYY"
                        maxDate={todayIso()}
                        firstDayOfWeek={firstDayOfWeek}
                        popoverProps={{ withinPortal: true }}
                    />
                    <div>
                        <Text size="sm" fw={500} mb={4}>
                            Type
                        </Text>
                        <SegmentedControl
                            fullWidth
                            value={kind}
                            onChange={(v) => setKind(v as "spend" | "refund")}
                            data={[
                                { value: "spend", label: "Spend" },
                                { value: "refund", label: "Refund" },
                            ]}
                        />
                    </div>
                </Group>
                <TextInput
                    label="Description"
                    placeholder="e.g. Tesco"
                    value={description}
                    onChange={(e) => setDescription(e.currentTarget.value)}
                    autoFocus
                />
                <div>
                    <Text size="sm" fw={500} mb={4}>
                        Who paid?
                    </Text>
                    <SegmentedControl
                        fullWidth
                        value={ownerId ?? ""}
                        onChange={(v) => setOwnerId(v || null)}
                        data={orderedMembers.map((m) => ({
                            value: m.id,
                            label: m.displayName,
                        }))}
                    />
                </div>
                <SpendFundingFields
                    value={{ potId, categoryId, settledAtSource }}
                    onChange={(f) => {
                        setChosenPotId(f.potId);
                        setCategoryId(f.categoryId);
                        setSettledAtSource(f.settledAtSource);
                        // Any explicit funding choice stops the description-based pot suggestion.
                        setPotManuallyChosen(true);
                    }}
                    pots={pots}
                    members={members}
                    categories={categories}
                />
                {(error || add.error) && (
                    <Alert color="red" title="Error">
                        {error || add.error?.message}
                    </Alert>
                )}
                {successMessage && !error && (
                    <Alert color="moss" title="Logged">
                        {successMessage}
                    </Alert>
                )}
                {pendingUpdate && (
                    <Alert color="apricot" title="Update this outgoing?">
                        <Stack gap="xs">
                            <Text size="sm">
                                You logged a different amount than{" "}
                                {pendingUpdate.name}'s expected{" "}
                                {formatMoney(pendingUpdate.from, money)}. Update
                                it to {formatMoney(pendingUpdate.to, money)}{" "}
                                going forward?
                            </Text>
                            {(() => {
                                const yearly = annualise(
                                    pendingUpdate.to - pendingUpdate.from,
                                    pendingUpdate.recurrence
                                );
                                if (yearly === 0) return null;
                                const sign = yearly > 0 ? "+" : "−";
                                return (
                                    <Text
                                        size="sm"
                                        fw={600}
                                        c={yearly > 0 ? "red" : "teal"}
                                    >
                                        {sign}
                                        {formatMoney(Math.abs(yearly), money)}
                                        /year
                                    </Text>
                                );
                            })()}
                            <Group gap="xs">
                                <Button
                                    size="xs"
                                    onClick={() => void applyOutgoingUpdate()}
                                    loading={updateExpense.isPending}
                                >
                                    Update {pendingUpdate.name}
                                </Button>
                                <Button
                                    size="xs"
                                    variant="default"
                                    onClick={() => setPendingUpdate(null)}
                                >
                                    Keep as is
                                </Button>
                            </Group>
                        </Stack>
                    </Alert>
                )}
                <Group justify="flex-end">
                    <Button
                        variant="default"
                        onClick={() => {
                            resetForm(ownerId, todayIso());
                            setSuccessMessage("");
                            setPendingUpdate(null);
                        }}
                    >
                        Reset
                    </Button>
                    <Button
                        onClick={() => void handleSubmit()}
                        loading={add.isPending}
                    >
                        Add {kind === "refund" ? "refund" : "spend"}
                    </Button>
                </Group>
            </Stack>
        </Card>
    );
};
