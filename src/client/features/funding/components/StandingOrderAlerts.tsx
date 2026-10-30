import { formatMoney } from "@shared/money";
import { trpc } from "@/trpc";
import { useMoney, type MoneyFormat } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import type { StandingOrderContributor } from "../../../../server/features/budget/standingOrders";

/** A signed monthly delta as plain text, e.g. `+£2/mo` or `−£5/mo`. */
const deltaLabel = (minor: number, money: MoneyFormat): string =>
    `${minor > 0 ? "+" : "−"}${formatMoney(Math.abs(minor), money)}/mo`;

const contributorLabel = (
    c: StandingOrderContributor,
    money: MoneyFormat
): string => `${c.name} ${deltaLabel(c.deltaMonthly, money)}`;

/** Surfaces pots whose standing order has gone stale since it was last set up
 *  (issue #69): a bill change moved the requirement, so what the bank pays is
 *  now wrong. Each says what changed and takes the "done" acknowledgement. */
export const StandingOrderAlerts = () => {
    const money = useMoney();
    const utils = trpc.useUtils();
    const alertsQuery = trpc.standingOrders.alerts.useQuery();
    const acknowledge = trpc.standingOrders.acknowledge.useMutation();

    const alerts = alertsQuery.data ?? [];

    const handleAcknowledge = async (potId: string) => {
        await acknowledge.mutateAsync({ potId });
        await utils.standingOrders.alerts.invalidate();
    };

    return alerts.map((alert) => (
        <Notice
            key={alert.potId}
            tone="attention"
            title={`Update the ${alert.potName} standing order`}
            action={
                <Button
                    variant="attention"
                    disabled={acknowledge.isPending}
                    onClick={() => void handleAcknowledge(alert.potId)}
                >
                    Done, I&apos;ve updated it
                </Button>
            }
        >
            {formatMoney(alert.wasMonthly, money)} →{" "}
            {formatMoney(alert.nowMonthly, money)} a month
            {alert.contributors.length > 0 &&
                ` · ${alert.contributors.map((c) => contributorLabel(c, money)).join(", ")}`}
        </Notice>
    ));
};
