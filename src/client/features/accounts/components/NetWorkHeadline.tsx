import type { MoneyFormat } from "@/useMoney";
import { Box, Card, Group, Text } from "@mantine/core";
import { hearthTokens } from "@/theme";
import { formatMoney } from "@shared/money";

export interface NetWorthHeadlineProps {
    assets: number;
    liabilities: number;
    netWorth: number;
    money: MoneyFormat;
}

export const NetWorthHeadline = ({
    assets,
    liabilities,
    netWorth,
    money,
}: NetWorthHeadlineProps) => {
    const negative = netWorth < 0;
    return (
        <Card
            padding="lg"
            radius="lg"
            style={{
                backgroundColor:
                    "light-dark(var(--mantine-color-moss-0), var(--mantine-color-dark-6))",
                border: `1px solid ${hearthTokens.brand.moss}33`,
            }}
        >
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
                fz={40}
                c={negative ? "red" : undefined}
                style={{
                    fontFamily: "var(--mantine-font-family-headings)",
                    lineHeight: 1.1,
                }}
            >
                {formatMoney(netWorth, money)}
            </Text>
            <Group gap="xl" mt="sm">
                <Group gap={6}>
                    <Box
                        w={10}
                        h={10}
                        style={{
                            borderRadius: 2,
                            backgroundColor: hearthTokens.brand.moss,
                        }}
                    />
                    <Text size="sm" c="dimmed">
                        Assets {formatMoney(assets, money)}
                    </Text>
                </Group>
                <Group gap={6}>
                    <Box
                        w={10}
                        h={10}
                        style={{
                            borderRadius: 2,
                            backgroundColor: hearthTokens.brand.apricot,
                        }}
                    />
                    <Text size="sm" c="dimmed">
                        Liabilities {formatMoney(liabilities, money)}
                    </Text>
                </Group>
            </Group>
        </Card>
    );
};
