import { ChevronRight } from "lucide-react";
import { formatMoney } from "@shared/money";
import { ageLabel } from "@/relativeDate";
import { useFormatDate, type MoneyFormat } from "@/useMoney";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/ui/Button";
import { daysSince, STALE_DAYS, subtypeLabel } from "../util";
import type { AccountWithValue } from "../model";

export interface AccountRowProps {
    account: AccountWithValue;
    ownerName: string;
    money: MoneyFormat;
    onOpen: () => void;
}

/** One account and its latest balance. The whole row is the one tap target:
 *  it opens the balances, and everything else about the account is in there. */
export const AccountRow = ({
    account,
    ownerName,
    money,
    onOpen,
}: AccountRowProps) => {
    const formatDate = useFormatDate();

    const { asOfDate, currentValue } = account;
    const details = [
        subtypeLabel(account.kind, account.subtype),
        account.institution,
        ownerName,
    ].filter(Boolean);
    const age = asOfDate === null ? null : daysSince(asOfDate);

    return (
        <li>
            <Button
                variant="ghost"
                className="h-auto w-full justify-between gap-3 whitespace-normal px-2 py-2.5 text-left font-normal"
                onClick={onOpen}
            >
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-medium text-text">
                        {account.name}
                    </span>
                    <span className="block truncate text-sm text-text-muted">
                        {details.join(" · ")}
                    </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="tabular text-base font-medium text-text">
                        {currentValue === null
                            ? "—"
                            : formatMoney(currentValue, money)}
                    </span>
                    {age === null || asOfDate === null ? (
                        <Badge variant="attention">No balance</Badge>
                    ) : age > STALE_DAYS ? (
                        <Badge variant="attention" title={ageLabel(age)}>
                            Out of date
                        </Badge>
                    ) : (
                        <span className="text-sm text-text-muted">
                            {formatDate(asOfDate)}
                        </span>
                    )}
                </span>
                <ChevronRight className="text-text-faint" />
            </Button>
        </li>
    );
};
