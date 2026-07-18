// ---------------------------------------------------------------------------
// Per-pot row — groups its payers
// ---------------------------------------------------------------------------

import type { BacklogPot } from "@/features/catchup/model";
import type { Member } from "../../../../server/db/schema";
import type { MoneyFormat } from "@/useMoney";
import { Badge, Card, Divider, Group, Stack, Text } from "@mantine/core";
import { PayerRow } from "./PayerRow";
import { formatMoney } from "@shared/money";

export interface PotBacklogRow {
    pot: BacklogPot;
    members: Member[];
    money: MoneyFormat;
}

export const PotBacklogRow = ({ pot, members, money }: PotBacklogRow) => {
    const owner = members.find((m) => m.id === pot.ownerId);
    const owed = pot.total + pot.residual;
    const isPullBack = owed < 0;

    return (
        <Card withBorder padding="sm">
            <Stack gap="xs">
                <Group gap="xs" wrap="wrap">
                    <Text fw={600}>
                        {isPullBack ? "Pull" : "Transfer"}{" "}
                        {formatMoney(Math.abs(owed), money)}{" "}
                        {isPullBack ? "into" : "out of"} {pot.potName}
                    </Text>
                    {owner && (
                        <Badge
                            size="sm"
                            variant="light"
                            color={owner.color ?? "gray"}
                        >
                            {owner.displayName}
                        </Badge>
                    )}
                    {pot.payers.length > 1 && (
                        <Text size="xs" c="dimmed">
                            across {pot.payers.length} people
                        </Text>
                    )}
                </Group>
                <Divider />
                <Stack gap={6}>
                    {pot.payers.map((payer) => (
                        <PayerRow
                            key={payer.ownerId}
                            potId={pot.potId}
                            payer={payer}
                            members={members}
                            money={money}
                        />
                    ))}
                </Stack>
            </Stack>
        </Card>
    );
};
