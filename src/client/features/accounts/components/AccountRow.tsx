import { formatMoney } from "@shared/money";
import { ageLabel } from "@/relativeDate";
import { useFormatDate, type MoneyFormat } from "@/useMoney";
import { Badge } from "@/components/shadcn/badge";
import { ListRow } from "@/components/ui/ListRow";
import { daysSince, STALE_DAYS, subtypeLabel } from "../util";
import type { AccountWithValue } from "../model";

export interface AccountRowProps {
    account: AccountWithValue;
    ownerName: string;
    money: MoneyFormat;
    onOpen: () => void;
}

/** One account and its latest balance. Opens the balances, and everything else
 *  about the account is in there. */
export const AccountRow = ({
    account,
    ownerName,
    money,
    onOpen,
}: AccountRowProps) => {
    const formatDate = useFormatDate();

    const { asOfDate, currentValue } = account;
    const age = asOfDate === null ? null : daysSince(asOfDate);

    return (
        <ListRow
            title={account.name}
            details={[
                subtypeLabel(account.kind, account.subtype),
                account.institution,
                ownerName,
            ]
                .filter(Boolean)
                .join(" · ")}
            value={
                currentValue === null ? "—" : formatMoney(currentValue, money)
            }
            meta={
                age === null || asOfDate === null ? (
                    <Badge variant="attention">No balance</Badge>
                ) : age > STALE_DAYS ? (
                    <Badge variant="attention" title={ageLabel(age)}>
                        Out of date
                    </Badge>
                ) : (
                    <span className="text-sm text-text-muted">
                        {formatDate(asOfDate)}
                    </span>
                )
            }
            onClick={onOpen}
        />
    );
};
