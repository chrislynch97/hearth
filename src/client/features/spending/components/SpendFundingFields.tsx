import { groupedPotOptions } from "@/potOptions";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Combobox } from "@/components/ui/Combobox";
import { FieldGroup } from "@/components/ui/FieldGroup";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { Category, Member, Pot, SpendFunding } from "../model";

const SOURCES: Array<{ value: "pot" | "main"; label: string }> = [
    { value: "pot", label: "A pot" },
    { value: "main", label: "Main account" },
];

export interface SpendFundingFieldsProps {
    value: SpendFunding;
    onChange: (next: SpendFunding) => void;
    pots: Pot[];
    members: Member[];
    categories: Category[];
}

/** Where a spend's money comes from: a pot, which goes on Catch-up unless it's
 *  already come out, or the main account, which never does. */
export const SpendFundingFields = ({
    value,
    onChange,
    pots,
    members,
    categories,
}: SpendFundingFieldsProps) => {
    const { potId, categoryId, settledAtSource } = value;
    // An empty pot is still "a pot": it means needs a pot, not the main account.
    const source = potId === null && settledAtSource ? "main" : "pot";

    return (
        <>
            <FieldGroup label="Comes from">
                <SegmentedControl
                    label="Comes from"
                    options={SOURCES}
                    value={source}
                    onChange={(next) =>
                        onChange({
                            potId: null,
                            categoryId: next === "main" ? categoryId : null,
                            settledAtSource: next === "main",
                        })
                    }
                    className="w-full [&>*]:flex-1"
                />
            </FieldGroup>
            {source === "pot" ? (
                <>
                    <Combobox
                        label="Pot"
                        placeholder="Assign later"
                        clearLabel="Assign later"
                        options={groupedPotOptions(pots, members)}
                        value={potId}
                        onChange={(next) =>
                            onChange({
                                potId: next,
                                categoryId: null,
                                settledAtSource: next ? settledAtSource : false,
                            })
                        }
                    />
                    {potId && (
                        <CheckboxField
                            checked={settledAtSource}
                            onCheckedChange={(checked) =>
                                onChange({
                                    potId,
                                    categoryId: null,
                                    settledAtSource: checked,
                                })
                            }
                            label="Already came out"
                            description="For a pot that auto-deducts. No transfer needed, so it stays off Catch-up."
                        />
                    )}
                </>
            ) : (
                <Combobox
                    label="Category"
                    placeholder="Pick a category"
                    options={categories.map((c) => ({
                        value: c.id,
                        label: c.name,
                    }))}
                    value={categoryId}
                    onChange={(next) =>
                        onChange({
                            potId: null,
                            categoryId: next,
                            settledAtSource: true,
                        })
                    }
                />
            )}
        </>
    );
};
