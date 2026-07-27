import { Card, Group, Text } from "@mantine/core";
import { Link } from "@tanstack/react-router";
import { Sparkline } from "@microcharts/react/sparkline";
import { formatMoney } from "@shared/money";
import { moneyFormat } from "@/microcharts";
import { hearthTokens } from "@/theme";
import type { MoneyFormat } from "@/useMoney";

export interface NetWorthTileProps {
    data: {
        assets: number;
        liabilities: number;
        netWorth: number;
        timeline: Array<{ date: string; netWorth: number }>;
    };
    money: MoneyFormat;
}

/** Current standing (period-independent), linking through to /accounts. */
export const NetWorthTile = ({ data, money }: NetWorthTileProps) => {
    const hasData =
        data.assets !== 0 || data.liabilities !== 0 || data.timeline.length > 0;
    if (!hasData) return null;

    const negative = data.netWorth < 0;
    const spark = data.timeline.slice(-12);

    return (
        <Card
            component={Link}
            to="/accounts"
            padding="lg"
            radius="lg"
            style={{
                textDecoration: "none",
                color: "inherit",
                backgroundColor:
                    "light-dark(var(--mantine-color-moss-0), var(--mantine-color-dark-6))",
                border: `1px solid ${hearthTokens.brand.moss}33`,
            }}
        >
            <Group justify="space-between" align="flex-end" wrap="nowrap">
                <div>
                    <Text
                        size="xs"
                        fw={700}
                        tt="uppercase"
                        c="dimmed"
                        ff="monospace"
                        lts="0.05em"
                        mb={4}
                    >
                        Net worth
                    </Text>
                    <Text
                        fw={700}
                        fz={28}
                        c={negative ? "red" : undefined}
                        style={{
                            fontFamily: "var(--mantine-font-family-headings)",
                            lineHeight: 1.1,
                        }}
                    >
                        {formatMoney(data.netWorth, money)}
                    </Text>
                    <Group gap="md" mt={4}>
                        <Text size="xs" c="dimmed">
                            Assets {formatMoney(data.assets, money)}
                        </Text>
                        <Text size="xs" c="dimmed">
                            Liabilities {formatMoney(data.liabilities, money)}
                        </Text>
                    </Group>
                </div>
                {spark.length >= 2 && (
                    <Sparkline
                        data={spark.map((p) => p.netWorth)}
                        width={110}
                        height={40}
                        fill
                        format={moneyFormat(money)}
                        title="Net worth over the last 12 recorded points"
                    />
                )}
            </Group>
        </Card>
    );
};
