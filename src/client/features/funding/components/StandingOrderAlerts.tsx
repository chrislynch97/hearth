import { formatMoney } from "@shared/money";
import { trpc } from "@/trpc";
import { useMoney, type MoneyFormat } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import type { StandingOrderContributor } from "../../../../server/features/budget/standingOrders";

/** A signed monthly delta as plain text, e.g. `+£2/mo` or `−£5/mo`. */
const deltaLabel = (minor: number, money: MoneyFormat): string =>
    `${minor > 0 ? "+" : "−"}${formatMoney(Math.abs(minor), money)}/mo`;

const contributorLabel = (
    c: StandingOrderContributor,
    money: MoneyFormat
): string => `${c.name} ${deltaLabel(c.deltaMonthly, money)}`;

/** Surfaces pots whose standing order has gone stale since it was last set up
 *  (issue #69) — a bill change moved the derived requirement, so the standing
 *  order at the real bank is now wrong. Each carries the was→now delta, the bills
 *  that caused it, and a "done, I've updated the bank" acknowledgement. */
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

    if (alerts.length === 0) return null;

    return (
        <div className="flex flex-col gap-2">
            {alerts.map((a) => (
                <Callout
                    key={a.potId}
                    tone="attention"
                    title={`${a.potName} — standing order needs updating`}
                >
                    <p className="text-sm">
                        was {formatMoney(a.wasMonthly, money)}/mo → now{" "}
                        {formatMoney(a.nowMonthly, money)}/mo{" "}
                        <span
                            className={[
                                "font-semibold",
                                a.deltaMonthly > 0
                                    ? "text-danger"
                                    : "text-positive-fg",
                            ].join(" ")}
                        >
                            ({deltaLabel(a.deltaMonthly, money)})
                        </span>
                    </p>
                    {a.contributors.length > 0 && (
                        <p className="mt-1 text-xs text-text-muted">
                            {a.contributors
                                .map((c) => contributorLabel(c, money))
                                .join(", ")}
                        </p>
                    )}
                    <Button
                        compact
                        className="mt-2"
                        disabled={acknowledge.isPending}
                        onClick={() => void handleAcknowledge(a.potId)}
                    >
                        Done, I've updated the bank
                    </Button>
                </Callout>
            ))}
        </div>
    );
};
