import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectSeparator,
    SelectTrigger,
    SelectValue,
} from "@/components/shadcn/select";
import { ALL, groupKey, type PlanGroup } from "@/features/plan/model";

export interface CategoryFilterProps {
    groups: PlanGroup[];
    /** `ALL`, a category id, or `UNCATEGORISED`. */
    selected: string;
    onSelect: (key: string) => void;
    total: number;
    money: MoneyFormat;
}

const Amount = ({ children }: { children: string }) => (
    <span className="tabular ml-auto pl-3 text-xs text-text-faint">
        {children}
    </span>
);

/** Which category the plan shows. "All categories" is the resting state, so an
 *  untouched picker reads as unfiltered. */
export const CategoryFilter = ({
    groups,
    selected,
    onSelect,
    total,
    money,
}: CategoryFilterProps) => (
    <Select value={selected} onValueChange={onSelect}>
        <SelectTrigger
            aria-label="Category"
            className="w-full bg-raised text-base sm:w-[240px]"
        >
            <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" className="hearth-ds">
            <SelectItem value={ALL} className="text-base">
                All categories
                <Amount>{formatMoney(total, money)}</Amount>
            </SelectItem>
            {/* "All" is not a category, so it is ruled off from them. */}
            <SelectSeparator />
            {groups.map((group) => (
                <SelectItem
                    key={groupKey(group)}
                    value={groupKey(group)}
                    className="text-base"
                >
                    {group.name}
                    <Amount>{formatMoney(group.perPeriod, money)}</Amount>
                </SelectItem>
            ))}
        </SelectContent>
    </Select>
);
