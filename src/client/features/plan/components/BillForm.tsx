import { Controller, useForm, useWatch } from "react-hook-form";
import { fromMinor, toMinor } from "@shared/money";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { useMoney } from "@/useMoney";
import { groupedPotOptions, orderMembers } from "@/potOptions";
import { Button } from "@/components/ui/Button";
import { FormFooter } from "@/components/ui/FormFooter";
import { Combobox } from "@/components/ui/Combobox";
import { FormCheckbox } from "@/components/ui/FormCheckbox";
import { FormChoiceField } from "@/components/ui/FormChoiceField";
import { TextField } from "@/components/ui/TextField";
import { ArchiveAction } from "@/components/ui/ArchiveAction";
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
    /** Main-account bills only; "" = the joint account. */
    ownerId: string;
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

    // An owner who has since been archived reads as joint, as the funding plan
    // already treats them.
    const people = orderMembers(members).filter(
        (member) => member.kind === "person" && member.archivedAt === null
    );
    const liveOwnerId =
        people.find((person) => person.id === bill?.ownerId)?.id ?? "";

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
            ownerId: liveOwnerId,
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
            utils.plan.potBalances.invalidate(),
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
            ownerId: isMain ? values.ownerId || null : null,
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

    const categoryOptions = categories.map((category) => ({
        value: category.id,
        label: category.name,
    }));
    const accountOptions = people.map((person) => ({
        value: person.id,
        label: person.displayName,
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
                <div className="grid grid-cols-2 gap-3">
                    <TextField
                        label="Amount"
                        placeholder="0.00"
                        inputMode="decimal"
                        prefix={money.symbol}
                        error={errors.amountMajor?.message}
                        {...register("amountMajor", {
                            validate: (value) =>
                                Number(value) > 0 || "Enter an amount.",
                        })}
                    />
                    <FormChoiceField
                        control={control}
                        name="recurrence"
                        label="Every"
                        options={RECURRENCES}
                    />
                </div>
                <FormChoiceField
                    control={control}
                    name="funding"
                    label="How it is paid"
                    options={FUNDINGS}
                    description={FUNDING_HINT[funding]}
                />
                {isMain ? (
                    <div className="grid grid-cols-2 gap-3">
                        <FormChoiceField
                            control={control}
                            name="categoryId"
                            rules={{
                                validate: (value) =>
                                    !isMain ||
                                    String(value).length > 0 ||
                                    "A main-account bill needs a category.",
                            }}
                            label="Category"
                            placeholder="Pick a category"
                            options={categoryOptions}
                            error={errors.categoryId?.message}
                        />
                        <FormChoiceField
                            control={control}
                            name="ownerId"
                            label="Paid from"
                            emptyLabel="Joint"
                            options={accountOptions}
                        />
                    </div>
                ) : (
                    <Controller
                        control={control}
                        name="potId"
                        rules={{
                            validate: (value) =>
                                isMain || value.length > 0 || "Pick a pot.",
                        }}
                        render={({ field }) => (
                            <Combobox
                                label="Pot"
                                placeholder="Pick a pot"
                                options={groupedPotOptions(pots, members)}
                                value={field.value || null}
                                onChange={(value) =>
                                    field.onChange(value ?? "")
                                }
                                error={errors.potId?.message}
                            />
                        )}
                    />
                )}
                <div className="grid grid-cols-2 gap-3">
                    <TextField
                        label="Next due"
                        type="date"
                        {...register("dueAnchor")}
                    />
                    <TextField
                        label="Note"
                        placeholder="Optional"
                        {...register("note")}
                    />
                </div>
                <FormCheckbox
                    control={control}
                    name="includeInEmergencyFund"
                    label="Counts toward the emergency fund"
                />
            </div>

            <FormFooter
                aside={
                    bill && (
                        <ArchiveAction
                            label="Archive bill"
                            consequence="It stops being funded and leaves the plan. Past spends keep their history."
                            pending={archive.isPending}
                            onArchive={() => void handleArchive()}
                        />
                    )
                }
            >
                <Button
                    variant="solid"
                    type="submit"
                    disabled={isSubmitting}
                    className="max-sm:h-9 max-sm:w-full"
                >
                    {bill ? "Save changes" : "Add bill"}
                </Button>
            </FormFooter>
        </form>
    );
};
