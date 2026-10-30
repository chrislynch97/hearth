import type { KeyboardEvent, Ref } from "react";
import { todayIso } from "@shared/dates";
import { orderMembers } from "@/potOptions";
import type { MoneyFormat } from "@/useMoney";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { FieldGroup } from "@/components/ui/FieldGroup";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TextField } from "@/components/ui/TextField";
import type { Category, Member, Pot, SpendDraft } from "../model";
import { SpendFundingFields } from "./SpendFundingFields";

export interface SpendFieldsProps {
    draft: SpendDraft;
    onChange: (patch: Partial<SpendDraft>) => void;
    onSubmit: () => void;
    members: Member[];
    pots: Pot[];
    categories: Category[];
    money: MoneyFormat;
    /** Lets adding put the cursor back here for the next receipt. */
    amountRef?: Ref<HTMLInputElement>;
    /** Takes the cursor on opening, ahead of anything above these fields. */
    autoFocusAmount?: boolean;
}

/** The fields of a spend, shared by adding and editing. Amount comes first: it's
 *  the number on the receipt in your hand. */
export const SpendFields = ({
    draft,
    onChange,
    onSubmit,
    members,
    pots,
    categories,
    money,
    amountRef,
    autoFocusAmount,
}: SpendFieldsProps) => {
    const ordered = orderMembers(members);

    const submitOnEnter = (event: KeyboardEvent) => {
        if (event.key === "Enter") onSubmit();
    };

    return (
        <>
            <div className="grid grid-cols-2 gap-4">
                <TextField
                    ref={amountRef}
                    label="Amount"
                    inputMode="decimal"
                    prefix={money.symbol}
                    placeholder="0.00"
                    autoFocus={autoFocusAmount}
                    value={draft.amount}
                    onChange={(e) =>
                        onChange({ amount: e.currentTarget.value })
                    }
                    onKeyDown={submitOnEnter}
                />
                <TextField
                    label="Date"
                    type="date"
                    max={todayIso()}
                    value={draft.date}
                    onChange={(e) => onChange({ date: e.currentTarget.value })}
                    onKeyDown={submitOnEnter}
                />
            </div>
            <TextField
                label="Description"
                placeholder="e.g. Tesco"
                value={draft.description}
                onChange={(e) =>
                    onChange({ description: e.currentTarget.value })
                }
                onKeyDown={submitOnEnter}
            />
            <FieldGroup label="Who paid">
                <SegmentedControl
                    label="Who paid"
                    options={ordered.map((m) => ({
                        value: m.id,
                        label: m.displayName,
                    }))}
                    value={draft.ownerId ?? ""}
                    onChange={(ownerId) => onChange({ ownerId })}
                    className="w-full [&>*]:flex-1"
                />
            </FieldGroup>
            <SpendFundingFields
                value={draft.funding}
                onChange={(funding) => onChange({ funding })}
                pots={pots}
                members={members}
                categories={categories}
            />
            <CheckboxField
                checked={draft.refund}
                onCheckedChange={(refund) => onChange({ refund })}
                label="This is a refund"
            />
        </>
    );
};
