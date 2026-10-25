import { Link } from "@tanstack/react-router";
import { formatMoney } from "@shared/money";
import { useFormatDate, type MoneyFormat } from "@/useMoney";
import { Callout } from "@/components/ui/Callout";
import type { SavingsAlert } from "../../../../server/features/savings/savings";

export interface SavingsAlertsProps {
    alerts: SavingsAlert[];
    money: MoneyFormat;
}

/** Savings-goal items the pot won't cover in time, one callout each. Nothing
 *  when every goal is on track. */
export const SavingsAlerts = ({ alerts, money }: SavingsAlertsProps) => {
    const formatDate = useFormatDate();

    if (alerts.length === 0) return null;

    return (
        <div className="hearth-ds flex flex-col gap-2">
            {alerts.map((alert) => (
                <Callout key={alert.itemId} tone="attention">
                    <strong className="font-semibold">
                        {alert.itemName}, {formatMoney(alert.amount, money)},{" "}
                        {alert.kind === "overdue" ? "was due" : "due"}{" "}
                        {formatDate(alert.due)}
                    </strong>{" "}
                    · {alert.goalName}. The pot is{" "}
                    {formatMoney(alert.shortBy, money)} short for it.{" "}
                    <Link
                        to="/planners/$goal"
                        params={{ goal: alert.goalSlug }}
                        className="whitespace-nowrap font-semibold text-attention-fg"
                    >
                        Open planner →
                    </Link>
                </Callout>
            ))}
        </div>
    );
};
