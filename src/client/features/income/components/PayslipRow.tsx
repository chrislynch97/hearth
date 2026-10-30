import { formatMoney } from "@shared/money";
import { useFormatDate, type MoneyFormat } from "@/useMoney";
import { Badge } from "@/components/shadcn/badge";
import { ListRow } from "@/components/ui/ListRow";
import type { Payslip } from "../model";

export interface PayslipRowProps {
    payslip: Payslip;
    money: MoneyFormat;
    onOpen: () => void;
}

/** One payslip: when, what made it up, and what landed. */
export const PayslipRow = ({ payslip, money, onOpen }: PayslipRowProps) => {
    const formatDate = useFormatDate();

    const { totals } = payslip;

    return (
        <ListRow
            title={payslip.periodLabel || formatDate(payslip.payDate)}
            details={`${formatMoney(totals.grossPay, money)} gross · ${formatMoney(totals.totalDeductions, money)} deductions`}
            value={formatMoney(totals.effectiveNet, money)}
            meta={
                payslip.hasVariablePay && (
                    <Badge variant="attention">Variable</Badge>
                )
            }
            onClick={onOpen}
        />
    );
};
