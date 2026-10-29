import { Link } from "@tanstack/react-router";
import { formatMoney } from "@shared/money";
import { useFormatDate, type MoneyFormat } from "@/useMoney";
import { buttonClass } from "@/components/ui/buttonClass";
import { Notice } from "@/components/ui/Notice";
import type { SavingsAlert } from "../../../../server/features/savings/savings";

export interface SavingsAlertsProps {
    alerts: SavingsAlert[];
    money: MoneyFormat;
}

/** Savings-goal items the pot won't cover in time, one notice each. Nothing
 *  when every goal is on track. */
export const SavingsAlerts = ({ alerts, money }: SavingsAlertsProps) => {
    const formatDate = useFormatDate();

    if (alerts.length === 0) return null;

    return (
        <div className="flex flex-col gap-2">
            {alerts.map((alert) => (
                <Notice
                    key={alert.itemId}
                    tone="attention"
                    title={`${alert.itemName}, ${formatMoney(alert.amount, money)}, ${alert.kind === "overdue" ? "was due" : "due"} ${formatDate(alert.due)}`}
                    action={
                        <Link
                            to="/planners/$goal"
                            params={{ goal: alert.goalSlug }}
                            className={buttonClass({ variant: "attention" })}
                        >
                            Open planner
                        </Link>
                    }
                >
                    {alert.goalName}. The pot is{" "}
                    {formatMoney(alert.shortBy, money)} short for it.
                </Notice>
            ))}
        </div>
    );
};
