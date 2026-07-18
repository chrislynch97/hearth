import type { Category, Member, Pot } from "../../../../server/db/schema";
import { groupedPotOptions } from "@/potOptions";
import { SegmentedControl, Select, Stack, Switch, Text } from "@mantine/core";

export interface SpendFunding {
    potId: string | null;
    categoryId: string | null;
    settledAtSource: boolean;
}

export interface SpendFundingFieldsProps {
    value: SpendFunding;
    onChange: (next: SpendFunding) => void;
    pots: Pot[];
    members: Member[];
    categories: Category[];
}

export const SpendFundingFields = ({
    value,
    onChange,
    pots,
    members,
    categories,
}: SpendFundingFieldsProps) => {
    const { potId, categoryId, settledAtSource } = value;
    // Main account = no pot but settled at source; everything else is "a pot"
    // (including an empty pot, i.e. needs-a-pot).
    const source: "pot" | "main" =
        potId == null && settledAtSource ? "main" : "pot";
    const potGroups = groupedPotOptions(pots, members);

    return (
        <Stack gap="sm">
            <div>
                <Text size="sm" fw={500} mb={4}>
                    Comes from
                </Text>
                <SegmentedControl
                    fullWidth
                    value={source}
                    onChange={(v) =>
                        v === "main"
                            ? onChange({
                                  potId: null,
                                  categoryId,
                                  settledAtSource: true,
                              })
                            : onChange({
                                  potId: null,
                                  categoryId: null,
                                  settledAtSource: false,
                              })
                    }
                    data={[
                        { value: "pot", label: "A pot" },
                        { value: "main", label: "Main account" },
                    ]}
                />
            </div>

            {source === "pot" ? (
                <>
                    <Select
                        label="Pot"
                        placeholder="No pot (assign later)"
                        description="Leave empty to sort the pot out later — it'll show on Catch-up as needing a pot."
                        data={potGroups}
                        value={potId}
                        searchable
                        clearable
                        onChange={(v) =>
                            onChange({
                                potId: v || null,
                                categoryId: null,
                                settledAtSource: v ? settledAtSource : false,
                            })
                        }
                    />
                    {potId && (
                        <Switch
                            label="Already came out — no transfer needed"
                            description="Tick for a pot that auto-deducts (e.g. Monzo). Keeps it off Catch-up."
                            checked={settledAtSource}
                            onChange={(e) =>
                                onChange({
                                    potId,
                                    categoryId: null,
                                    settledAtSource: e.currentTarget.checked,
                                })
                            }
                        />
                    )}
                </>
            ) : (
                <Select
                    label="Category"
                    placeholder="Pick a category"
                    description="Paid straight from the main account — won't show on Catch-up."
                    data={categories.map((c) => ({
                        value: c.id,
                        label: c.name,
                    }))}
                    value={categoryId}
                    searchable
                    onChange={(v) =>
                        onChange({
                            potId: null,
                            categoryId: v,
                            settledAtSource: true,
                        })
                    }
                />
            )}
        </Stack>
    );
};
