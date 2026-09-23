import { PlanIcon } from "@/features/plan/components/PlanIcon";

export interface CountChipsProps {
    /** Omitted below the page header: a category doesn't count itself. */
    categories?: number;
    pots: number;
    bills: number;
    setAsides: number;
}

/** Colours match the cards below: apricot is what drains a pot, moss is what
 *  fills it. Categories and pots are the things themselves, not a direction, so
 *  they stay neutral. */
const CHIPS: {
    key: keyof CountChipsProps;
    tone: string;
    one: string;
    many: string;
}[] = [
    {
        key: "categories",
        tone: "text-text-muted",
        one: "category",
        many: "categories",
    },
    { key: "pots", tone: "text-text-muted", one: "pot", many: "pots" },
    { key: "bills", tone: "text-attention", one: "bill", many: "bills" },
    {
        key: "setAsides",
        tone: "text-primary",
        one: "set-aside",
        many: "set-asides",
    },
];

/** What something holds, as counts rather than a sentence. The tooltip carries
 *  the noun, so the row itself stays short. */
export const CountChips = ({
    categories,
    pots,
    bills,
    setAsides,
}: CountChipsProps) => {
    const counts = { categories, pots, bills, setAsides };

    return (
        <div className="flex items-center gap-3">
            {CHIPS.map((chip) => {
                const count = counts[chip.key];
                if (count === undefined) return null;
                const label = `${count} ${count === 1 ? chip.one : chip.many}`;

                return (
                    <span
                        key={chip.key}
                        role="img"
                        aria-label={label}
                        title={label}
                        className="flex items-center gap-1.5"
                    >
                        <PlanIcon name={chip.key} className={chip.tone} />
                        <span className="tabular text-sm text-text-secondary">
                            {count}
                        </span>
                    </span>
                );
            })}
        </div>
    );
};
