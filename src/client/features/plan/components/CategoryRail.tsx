import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { PlusIcon } from "@/components/ui/PlusIcon";
import { ALL, groupKey, type PlanGroup } from "@/features/plan/model";

export interface CategoryRailProps {
    groups: PlanGroup[];
    /** `ALL`, a category id, or `UNCATEGORISED`. */
    selected: string;
    onSelect: (key: string) => void;
    total: number;
    money: MoneyFormat;
    onAddCategory: () => void;
}

const rowClass = (active: boolean) =>
    [
        "relative flex h-[30px] w-full items-center gap-2 rounded-sm pl-2.5 pr-2 text-left",
        "transition-colors duration-[140ms] ease-out",
        active ? "bg-primary-tint" : "hover:bg-hover",
    ].join(" ");

/** The categories, as the thing you pick rather than a page you visit — a third
 *  nav tier against the sidebar, not a widget inside the page. This is all the
 *  old Categories page did: name the buckets. */
export const CategoryRail = ({
    groups,
    selected,
    onSelect,
    total,
    money,
    onAddCategory,
}: CategoryRailProps) => {
    const row = (key: string, name: string, amount: number) => {
        const active = selected === key;

        return (
            <button
                key={key}
                onClick={() => onSelect(key)}
                aria-current={active ? "true" : undefined}
                className={rowClass(active)}
            >
                {active && (
                    <span className="absolute -left-2 top-[7px] h-4 w-[3px] rounded-r-[2px] bg-primary" />
                )}
                <span
                    className={[
                        "min-w-0 flex-1 truncate text-base",
                        active
                            ? "font-semibold text-primary"
                            : "text-text-secondary",
                    ].join(" ")}
                >
                    {name}
                </span>
                <span
                    className={[
                        "tabular shrink-0 text-xs",
                        active ? "text-primary" : "text-text-faint",
                    ].join(" ")}
                >
                    {formatMoney(amount, money)}
                </span>
            </button>
        );
    };

    return (
        <nav
            aria-label="Categories"
            className="flex w-[200px] shrink-0 flex-col gap-px border-r border-border bg-sunken px-2 pb-3 pt-5"
        >
            <p className="px-2.5 pb-2 text-xs font-medium text-text-muted">
                Categories
            </p>
            {row(ALL, "All", total)}
            {/* "All" is not a category, so it is ruled off from them. */}
            <hr
                aria-hidden="true"
                className="mx-2.5 my-2 h-px border-0 bg-border"
            />
            {groups.map((group) =>
                row(groupKey(group), group.name, group.perPeriod)
            )}
            {/* Pinned to the foot of the rail, the way the sidebar's own tiers
                keep their account menu there. */}
            <Button
                variant="dashed"
                icon={<PlusIcon />}
                onClick={onAddCategory}
                className="mt-auto w-full"
            >
                New category
            </Button>
        </nav>
    );
};
