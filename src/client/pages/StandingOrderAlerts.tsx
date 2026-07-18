import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { trpc } from "../trpc";
import { formatMoney } from "../../shared/money";
import { useMoney, type MoneyFormat } from "../useMoney";
import type { StandingOrderContributor } from "../../server/plan/standingOrders";

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
        <Stack gap="sm">
            {alerts.map((a) => (
                <Alert
                    key={a.potId}
                    color="apricot"
                    title={`${a.potName} — standing order needs updating`}
                >
                    <Stack gap="xs">
                        <Text size="sm">
                            was {formatMoney(a.wasMonthly, money)}/mo → now{" "}
                            {formatMoney(a.nowMonthly, money)}/mo{" "}
                            <Text
                                span
                                fw={600}
                                c={a.deltaMonthly > 0 ? "red" : "teal"}
                            >
                                ({deltaLabel(a.deltaMonthly, money)})
                            </Text>
                        </Text>
                        {a.contributors.length > 0 && (
                            <Text size="xs" c="dimmed">
                                {a.contributors
                                    .map((c) => contributorLabel(c, money))
                                    .join(", ")}
                            </Text>
                        )}
                        <Group>
                            <Button
                                size="xs"
                                variant="default"
                                loading={acknowledge.isPending}
                                onClick={() => void handleAcknowledge(a.potId)}
                            >
                                Done, I've updated the bank
                            </Button>
                        </Group>
                    </Stack>
                </Alert>
            ))}
        </Stack>
    );
};
