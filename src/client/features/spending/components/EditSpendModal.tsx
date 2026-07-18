import { type MoneyFormat, useFirstDayOfWeek } from "@/useMoney";
import type {
    Member,
    Pot,
    SpendTransaction,
} from "../../../../server/db/schema";
import { trpc } from "@/trpc";
import { orderMembers } from "@/potOptions";
import { useState } from "react";
import { fromMinor, toMinor } from "@shared/money";
import {
    Alert,
    Button,
    Group,
    Modal,
    NumberInput,
    SegmentedControl,
    Stack,
    Text,
    TextInput,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { todayIso } from "@shared/dates";
import { SpendFundingFields } from "@/features/spending/components/SpendFundingFields";

export interface EditSpendModalProps {
    spend: SpendTransaction;
    members: Member[];
    pots: Pot[];
    money: MoneyFormat;
    opened: boolean;
    onClose: () => void;
}

export const EditSpendModal = ({
    spend,
    members,
    pots,
    money,
    opened,
    onClose,
}: EditSpendModalProps) => {
    const utils = trpc.useUtils();
    const firstDayOfWeek = useFirstDayOfWeek();
    const update = trpc.spends.update.useMutation();
    const categories = trpc.categories.list.useQuery().data ?? [];
    const orderedMembers = orderMembers(members);

    const [amountMajor, setAmountMajor] = useState<string>(
        String(fromMinor(Math.abs(spend.amount), money.decimalPlaces))
    );
    const [kind, setKind] = useState<"spend" | "refund">(
        spend.amount < 0 ? "refund" : "spend"
    );
    const [description, setDescription] = useState(spend.description);
    const [date, setDate] = useState<string | null>(spend.date);
    const [ownerId, setOwnerId] = useState<string | null>(spend.ownerId);
    const [potId, setPotId] = useState<string | null>(spend.potId);
    const [categoryId, setCategoryId] = useState<string | null>(
        spend.categoryId
    );
    const [settledAtSource, setSettledAtSource] = useState(
        spend.settledAtSource === 1
    );
    const [error, setError] = useState("");

    async function handleSave() {
        const trimmed = description.trim();
        if (!trimmed) {
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

        const minor = toMinor(majorValue, money.decimalPlaces);
        try {
            await update.mutateAsync({
                id: spend.id,
                expectedUpdatedAt: spend.updatedAt,
                date: date ?? undefined,
                description: trimmed,
                amount: kind === "refund" ? -minor : minor,
                ownerId,
                potId: potId || null,
                categoryId: potId ? null : categoryId,
                settledAtSource,
            });
            await Promise.all([
                utils.spends.list.invalidate(),
                utils.reconcile.backlog.invalidate(),
            ]);
            onClose();
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Could not save changes."
            );
        }
    }

    return (
        <Modal opened={opened} onClose={onClose} title="Edit spend" size="md">
            <Stack gap="sm">
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
                </Group>
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
                <TextInput
                    label="Description"
                    value={description}
                    onChange={(e) => setDescription(e.currentTarget.value)}
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
                        setPotId(f.potId);
                        setCategoryId(f.categoryId);
                        setSettledAtSource(f.settledAtSource);
                    }}
                    pots={pots}
                    members={members}
                    categories={categories}
                />
                {(error || update.error) && (
                    <Alert color="red" title="Error">
                        {error || update.error?.message}
                    </Alert>
                )}
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => void handleSave()}
                        loading={update.isPending}
                    >
                        Save changes
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
