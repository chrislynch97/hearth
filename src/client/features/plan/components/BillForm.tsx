import { useForm, useWatch } from "react-hook-form";
import { fromMinor, toMinor } from "@shared/money";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { useMoney } from "@/useMoney";
import { orderMembers } from "@/potOptions";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { ArchiveAction } from "@/features/plan/components/ArchiveAction";
import { fundingOf, type Funding } from "@/features/plan/model";
import type {
    Category,
    Expense,
    Member,
    Pot,
} from "../../../../server/db/schema";

export interface BillFormProps {
    /** Absent when adding. */
    bill: Expense | undefined;
    pots: Pot[];
    members: Member[];
    categories: Category[];
    /** Preselected when adding from a pot card. */
    defaultPotId: string | null;
    /** Preselected when adding from a category — and the only target a
     *  main-account bill has. */
    defaultCategoryId: string | null;
    onDone: () => void;
}

const RECURRENCES = [
    { value: "monthly", label: "Monthly" },
    { value: "quarterly", label: "Quarterly" },
    { value: "yearly", label: "Yearly" },
];

const FUNDINGS = [
    { value: "pot_manual", label: "From a pot" },
    { value: "pot_auto", label: "From a pot, automatically" },
    { value: "main", label: "Straight from the main account" },
];

const FUNDING_HINT: Record<Funding, string> = {
    pot_manual:
        "You move the money out of the pot yourself, so it shows up on Catch-up.",
    pot_auto: "The pot deducts it itself, so there is nothing to catch up on.",
    main: "No pot — it comes out of the main account under its category.",
};

interface BillFormValues {
    name: string;
    amountMajor: string;
    recurrence: string;
    funding: Funding;
    potId: string;
    categoryId: string;
    dueAnchor: string;
    note: string;
    includeInEmergencyFund: boolean;
}

export const BillForm = ({
    bill,
    pots,
    members,
    categories,
    defaultPotId,
    defaultCategoryId,
    onDone,
}: BillFormProps) => {
    const utils = trpc.useUtils();
    const money = useMoney();
    const create = trpc.expenses.create.useMutation();
    const update = trpc.expenses.update.useMutation();
    const archive = trpc.expenses.archive.useMutation();

    const {
        register,
        control,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<BillFormValues>({
        defaultValues: {
            name: bill?.name ?? "",
            amountMajor:
                bill?.amount != null
                    ? String(fromMinor(bill.amount, money.decimalPlaces))
                    : "",
            recurrence: bill?.recurrence ?? "monthly",
            funding: bill
                ? fundingOf(bill)
                : defaultPotId
                  ? "pot_manual"
                  : "main",
            potId: bill?.potId ?? defaultPotId ?? "",
            categoryId: bill?.categoryId ?? defaultCategoryId ?? "",
            dueAnchor: bill?.dueAnchor ?? "",
            note: bill?.note ?? "",
            includeInEmergencyFund: bill
                ? bill.includeInEmergencyFund !== 0
                : true,
        },
    });

    // useWatch, not watch(): the compiler cannot memoize a function-returning
    // API, and this one only needs the value.
    const funding = useWatch({ control, name: "funding" });
    const isMain = funding === "main";

    const refresh = () =>
        Promise.all([
            utils.expenses.list.invalidate(),
            utils.plan.funding.invalidate(),
            utils.standingOrders.alerts.invalidate(),
        ]);

    const submit = handleSubmit(async (values) => {
        const name = values.name.trim();
        const payload = {
            name,
            recurrence: values.recurrence as "monthly" | "quarterly" | "yearly",
            amount: toMinor(Number(values.amountMajor), money.decimalPlaces),
            funding: values.funding,
            potId: isMain ? null : values.potId,
            categoryId: isMain ? values.categoryId : null,
            note: values.note.trim() || undefined,
            dueAnchor: values.dueAnchor || undefined,
            includeInEmergencyFund: values.includeInEmergencyFund,
        };

        try {
            if (bill) {
                await update.mutateAsync({
                    id: bill.id,
                    expectedUpdatedAt: bill.updatedAt,
                    ...payload,
                });
            } else {
                await create.mutateAsync(payload);
            }
        } catch {
            return; // surfaced by the global error handler; keep the form open
        }
        await refresh();
        notifySuccess(bill ? `Saved ${name}.` : `Added ${name}.`);
        onDone();
    });

    const handleArchive = async () => {
        if (!bill) return;
        try {
            await archive.mutateAsync({ id: bill.id });
        } catch {
            return;
        }
        await refresh();
        notifySuccess(`Archived ${bill.name}.`);
        onDone();
    };

    // Flat, owner-prefixed: a native select has optgroups, but the prefix keeps
    // the chosen pot readable once the menu is closed.
    const ownerName = new Map(
        orderMembers(members).map((member) => [member.id, member.displayName])
    );
    const potOptions = pots
        .filter((pot) => pot.archivedAt === null)
        .map((pot) => ({
            value: pot.id,
            label: `${ownerName.get(pot.ownerId) ?? "—"} · ${pot.name}`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
    const categoryOptions = categories.map((category) => ({
        value: category.id,
        label: category.name,
    }));

    return (
        <form onSubmit={submit}>
            <div className="flex flex-col gap-3.5">
                <TextField
                    label="Name"
                    placeholder="e.g. Council tax"
                    error={errors.name?.message}
                    autoFocus
                    {...register("name", {
                        validate: (value) =>
                            value.trim().length > 0 || "Enter a name.",
                    })}
                />
                <div className="flex gap-2">
                    <TextField
                        label="Amount"
                        placeholder="0.00"
                        inputMode="decimal"
                        prefix={money.symbol}
                        className="flex-1"
                        error={errors.amountMajor?.message}
                        {...register("amountMajor", {
                            validate: (value) =>
                                Number(value) > 0 || "Enter an amount.",
                        })}
                    />
                    <SelectField
                        label="Every"
                        options={RECURRENCES}
                        className="w-32"
                        {...register("recurrence")}
                    />
                </div>
                <SelectField
                    label="How it is paid"
                    options={FUNDINGS}
                    description={FUNDING_HINT[funding]}
                    {...register("funding")}
                />
                {isMain ? (
                    <SelectField
                        label="Category"
                        placeholder="Pick a category"
                        options={categoryOptions}
                        error={errors.categoryId?.message}
                        {...register("categoryId", {
                            validate: (value) =>
                                !isMain ||
                                value.length > 0 ||
                                "A main-account bill needs a category.",
                        })}
                    />
                ) : (
                    <SelectField
                        label="Pot"
                        placeholder="Pick a pot"
                        options={potOptions}
                        error={errors.potId?.message}
                        {...register("potId", {
                            validate: (value) =>
                                isMain || value.length > 0 || "Pick a pot.",
                        })}
                    />
                )}
                <div className="flex gap-2">
                    <TextField
                        label="Next due"
                        type="date"
                        className="flex-1"
                        {...register("dueAnchor")}
                    />
                    <TextField
                        label="Note"
                        placeholder="Optional"
                        className="flex-1"
                        {...register("note")}
                    />
                </div>
                <Checkbox
                    label="Counts toward the emergency fund"
                    {...register("includeInEmergencyFund")}
                />
            </div>

            <div className="mt-5 flex justify-end gap-2">
                <Button variant="ghost" onClick={onDone}>
                    Cancel
                </Button>
                <Button variant="solid" type="submit" disabled={isSubmitting}>
                    {bill ? "Save changes" : "Add bill"}
                </Button>
            </div>

            {bill && (
                <ArchiveAction
                    label="Archive bill"
                    consequence="It stops being funded and leaves the plan. Past spends keep their history."
                    pending={archive.isPending}
                    onArchive={() => void handleArchive()}
                />
            )}
        </form>
    );
};
