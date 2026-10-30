import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/shadcn/card";
import type { AccountWithValue } from "../model";
import { AccountRow } from "./AccountRow";

export interface AccountGroupProps {
    title: string;
    accounts: AccountWithValue[];
    ownerName: (id: string) => string;
    total: number;
    money: MoneyFormat;
    onOpen: (account: AccountWithValue) => void;
}

/** The assets, or the liabilities: their total, then each account. */
export const AccountGroup = ({
    title,
    accounts,
    ownerName,
    total,
    money,
    onOpen,
}: AccountGroupProps) => (
    <Card>
        <CardHeader className="flex items-baseline justify-between gap-3">
            <CardTitle>{title}</CardTitle>
            <span className="tabular text-md font-semibold text-text">
                {formatMoney(total, money)}
            </span>
        </CardHeader>
        <CardContent>
            {accounts.length === 0 ? (
                <p className="text-base text-text-muted">None yet.</p>
            ) : (
                <ul className="-mx-2 flex flex-col divide-y divide-border">
                    {accounts.map((account) => (
                        <AccountRow
                            key={account.id}
                            account={account}
                            ownerName={ownerName(account.ownerId)}
                            money={money}
                            onOpen={() => onOpen(account)}
                        />
                    ))}
                </ul>
            )}
        </CardContent>
    </Card>
);
