export interface AllocationShare {
    label: string;
    amount: number;
    /** Of household income, 0–1; 0 when there is no income to divide. */
    share: number;
}

/** Categories largest first, with everything past the first `keep` rolled into
 *  one "Other" — so a bar and its legend stay readable however many
 *  categories a household has. */
export const allocationShares = (
    categories: ReadonlyArray<{ name: string; funding: number }>,
    income: number,
    keep = 5
): AllocationShare[] => {
    const share = (amount: number) => (income > 0 ? amount / income : 0);
    const ranked = categories
        .filter((c) => c.funding > 0)
        .toSorted((a, b) => b.funding - a.funding);

    const top = ranked
        .slice(0, keep)
        .map((c) => ({
            label: c.name,
            amount: c.funding,
            share: share(c.funding),
        }));
    const rest = ranked.slice(keep).reduce((sum, c) => sum + c.funding, 0);

    return rest > 0
        ? [...top, { label: "Other", amount: rest, share: share(rest) }]
        : top;
};
