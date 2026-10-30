import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/shadcn/card";
import { StatRow } from "@/components/ui/StatRow";
import type { MemberIncome } from "../model";

export interface MemberIncomeCardProps {
    member: MemberIncome;
    money: MoneyFormat;
}

/** What one person brings in a month, and where it comes from. */
export const MemberIncomeCard = ({ member, money }: MemberIncomeCardProps) => (
    <Card>
        <CardHeader>
            <CardTitle>{member.displayName}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
            <StatRow
                label="From payslips"
                value={formatMoney(member.salaryMonthly, money)}
            />
            <StatRow
                label="Other income"
                value={formatMoney(member.incomeSourceMonthly, money)}
            />
            <StatRow
                label="Monthly income"
                value={formatMoney(member.monthlyIncome, money)}
                total
            />
        </CardContent>
    </Card>
);
