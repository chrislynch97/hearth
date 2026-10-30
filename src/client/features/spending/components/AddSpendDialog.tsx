import { useRef, useState } from "react";
import { todayIso } from "@shared/dates";
import { formatMoney, fromMinor } from "@shared/money";
import { trpc } from "@/trpc";
import type { MoneyFormat } from "@/useMoney";
import { Combobox } from "@/components/ui/Combobox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Notice } from "@/components/ui/Notice";
import {
    draftAmount,
    draftError,
    type Member,
    type Pot,
    type SpendDraft,
} from "../model";
import { BillUpdatePrompt, type BillUpdate } from "./BillUpdatePrompt";
import { SpendFields } from "./SpendFields";

const dueLabel = (daysUntil: number): string => {
    if (daysUntil === 0) return "due today";
    if (daysUntil > 0) return `due in ${daysUntil}d`;
    return `due ${-daysUntil}d ago`;
};

export interface SpendDefaults {
    ownerId: string | null;
    date: string;
}

export interface AddSpendDialogProps {
    /** Who paid and when, carried over from the last one logged. */
    defaults: SpendDefaults;
    members: Member[];
    pots: Pot[];
    money: MoneyFormat;
    onClose: () => void;
    onLogged: (defaults: SpendDefaults) => void;
}

/** Logs spends one after another. It stays open and keeps who and when between
 *  them, because they tend to come in a stack of the same day's receipts (#65). */
export const AddSpendDialog = ({
    defaults,
    members,
    pots,
    money,
    onClose,
    onLogged,
}: AddSpendDialogProps) => {
    const utils = trpc.useUtils();
    const add = trpc.spends.add.useMutation();
    const updateExpense = trpc.expenses.update.useMutation();
    const bills = trpc.plan.recentlyDue.useQuery().data ?? [];
    const categories = trpc.categories.list.useQuery().data ?? [];
    const amountRef = useRef<HTMLInputElement>(null);
    const blank = (owner: string | null, date: string): SpendDraft => ({
        amount: "",
        refund: false,
        description: "",
        date,
        ownerId: owner,
        funding: { potId: null, categoryId: null, settledAtSource: false },
    });
    const [draft, setDraft] = useState(() =>
        blank(defaults.ownerId, defaults.date)
    );
    // Until funding is chosen, the pot follows the description-based suggestion.
    const [potChosen, setPotChosen] = useState(false);
    const [billKey, setBillKey] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [logged, setLogged] = useState("");
    const [billUpdate, setBillUpdate] = useState<BillUpdate | null>(null);

    const description = draft.description.trim();
    const suggestion = trpc.spends.suggestPot.useQuery(
        { description, ownerId: draft.ownerId ?? "" },
        { enabled: description.length > 0 && draft.ownerId !== null }
    ).data?.potId;
    const suggestedPot = pots.some((p) => p.id === suggestion)
        ? (suggestion ?? null)
        : null;
    const funding = potChosen
        ? draft.funding
        : { ...draft.funding, potId: suggestedPot };
    const bill = bills.find((b) => b.key === billKey) ?? null;

    const change = (patch: Partial<SpendDraft>) => {
        if (patch.funding) setPotChosen(true);
        setDraft((current) => ({ ...current, ...patch }));
    };

    // A bill is single-pot, so it maps straight onto one spend; its funding
    // decides whether the spend is settled at source.
    const pickBill = (key: string | null) => {
        setBillKey(key);
        setError("");
        setLogged("");
        const picked = bills.find((b) => b.key === key);
        if (!picked) return;
        setPotChosen(true);
        setDraft((current) => ({
            ...current,
            amount: String(fromMinor(picked.totalAmount, money.decimalPlaces)),
            refund: false,
            description: picked.name,
            date: picked.date,
            funding: {
                potId: picked.potId,
                categoryId: picked.categoryId,
                settledAtSource: picked.settledAtSource,
            },
        }));
    };

    const submit = async () => {
        const invalid = draftError(draft);
        if (invalid) return setError(invalid);
        setError("");
        setLogged("");
        const amount = draftAmount(draft, money.decimalPlaces);
        try {
            const inserted = await add.mutateAsync({
                date: draft.date || todayIso(),
                description,
                amount,
                ownerId: draft.ownerId ?? "",
                potId: funding.potId,
                categoryId: funding.potId ? null : funding.categoryId,
                expenseId: bill?.expenseId ?? null,
                settledAtSource: funding.settledAtSource,
            });
            await Promise.all([
                utils.spends.list.invalidate(),
                utils.spends.lastByOwner.invalidate(),
                utils.reconcile.backlog.invalidate(),
            ]);

            // A refund never redefines what a bill is expected to cost.
            setBillUpdate(
                bill && !draft.refund && amount !== bill.totalAmount
                    ? {
                          expenseId: bill.expenseId,
                          name: bill.name,
                          from: bill.totalAmount,
                          to: amount,
                          recurrence: bill.recurrence,
                          // The change took effect the day of the spend that revealed it.
                          effectiveDate: draft.date,
                          funding: bill.funding,
                          potId: bill.potId,
                      }
                    : null
            );
            const pot = pots.find((p) => p.id === inserted.potId)?.name;
            const figure = formatMoney(Math.abs(inserted.amount), money);
            setLogged(
                funding.settledAtSource
                    ? `Logged ${figure}. Already settled, so no catch-up needed.`
                    : `Logged ${figure}${pot ? `, to take from ${pot}` : ", and it needs a pot"}.`
            );
            onLogged({ ownerId: draft.ownerId, date: draft.date });
            setDraft(blank(draft.ownerId, draft.date));
            setPotChosen(false);
            setBillKey(null);
            amountRef.current?.focus();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not log that.");
        }
    };

    const applyBillUpdate = async () => {
        if (!billUpdate) return;
        // No optimistic-lock guard: this prompt comes from a plan projection
        // without the bill's updatedAt, so it stays last-write-wins (#23).
        await updateExpense.mutateAsync({
            id: billUpdate.expenseId,
            amount: billUpdate.to,
            priceSource: "spend_prompt",
            priceEffectiveDate: billUpdate.effectiveDate,
        });
        await Promise.all([
            utils.plan.recentlyDue.invalidate(),
            utils.plan.upcoming.invalidate(),
            utils.plan.funding.invalidate(),
            utils.expenses.list.invalidate(),
            utils.standingOrders.alerts.invalidate(),
        ]);

        // Surface the standing-order impact here, the moment to act on it (#69).
        // Only pot_manual bills have a standing order to update.
        let standingOrder = "";
        if (billUpdate.funding === "pot_manual" && billUpdate.potId) {
            const alerts = await utils.standingOrders.alerts.fetch();
            const alert = alerts.find((a) => a.potId === billUpdate.potId);
            if (alert) {
                standingOrder = ` ${alert.potName} standing order: ${formatMoney(alert.wasMonthly, money)}/mo → ${formatMoney(alert.nowMonthly, money)}/mo.`;
            }
        }
        setBillUpdate(null);
        setLogged(`Updated ${billUpdate.name} going forward.${standingOrder}`);
    };

    return (
        <ConfirmDialog
            open
            onOpenChange={(open) => !open && onClose()}
            title="Add spend"
            confirm={{
                label: draft.refund ? "Add refund" : "Add spend",
                onClick: () => void submit(),
                pending: add.isPending,
            }}
        >
            {logged && <Notice tone="positive" title={logged} />}
            {billUpdate && (
                <BillUpdatePrompt
                    update={billUpdate}
                    money={money}
                    pending={updateExpense.isPending}
                    onUpdate={() => void applyBillUpdate()}
                    onKeep={() => setBillUpdate(null)}
                />
            )}
            {bills.length > 0 && (
                <Combobox
                    label="Regular bill (optional)"
                    placeholder="Fill in from a recent bill"
                    clearLabel="None"
                    options={bills.map((b) => ({
                        value: b.key,
                        label: `${b.name} · ${formatMoney(b.totalAmount, money)} · ${dueLabel(b.daysUntil)}`,
                    }))}
                    value={billKey}
                    onChange={pickBill}
                />
            )}
            <SpendFields
                draft={{ ...draft, funding }}
                onChange={change}
                onSubmit={() => void submit()}
                members={members}
                pots={pots}
                categories={categories}
                money={money}
                amountRef={amountRef}
                autoFocusAmount
            />
            {error && <Notice tone="danger" title={error} />}
        </ConfirmDialog>
    );
};
