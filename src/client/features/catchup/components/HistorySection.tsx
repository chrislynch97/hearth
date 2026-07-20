import type { MoneyFormat } from "@/useMoney";
import { trpc } from "@/trpc";
import {
    Badge,
    Button,
    Card,
    Center,
    Group,
    Loader,
    Stack,
    Text,
    Title,
} from "@mantine/core";
import { formatMoney } from "@shared/money";
import { batchSummary } from "../model";

export interface HistorySectionProps {
    money: MoneyFormat;
}

export const HistorySection = ({ money }: HistorySectionProps) => {
    const utils = trpc.useUtils();
    const batchesQuery = trpc.reconcile.batches.useQuery();
    const potsQuery = trpc.pots.list.useQuery();
    const undo = trpc.reconcile.undoBatch.useMutation();

    const batches = batchesQuery.data ?? [];
    const pots = potsQuery.data ?? [];
    const potById = new Map(pots.map((p) => [p.id, p]));

    async function handleUndo(batchId: string) {
        await undo.mutateAsync({ batchId });
        await Promise.all([
            utils.reconcile.backlog.invalidate(),
            utils.reconcile.batches.invalidate(),
            utils.spends.list.invalidate(),
        ]);
    }

    return (
        <Card withBorder padding="md">
            <Stack gap="sm">
                <Title order={4}>History</Title>
                {batchesQuery.isLoading && (
                    <Center>
                        <Loader size="sm" />
                    </Center>
                )}
                {!batchesQuery.isLoading && batches.length === 0 && (
                    <Text size="sm" c="dimmed">
                        No reconciliations yet.
                    </Text>
                )}
                <Stack gap="xs">
                    {batches.map((b) => {
                        const potName = b.potId
                            ? (potById.get(b.potId)?.name ?? "Unknown pot")
                            : "Mixed";
                        const { isReversed, isWriteOff, isPartial } =
                            batchSummary(b);
                        return (
                            <Group
                                key={b.id}
                                justify="space-between"
                                wrap="wrap"
                                px="xs"
                                py={6}
                                style={{
                                    borderRadius: 6,
                                    background:
                                        "light-dark(var(--mantine-color-sand-0), var(--mantine-color-dark-6))",
                                    opacity: isReversed ? 0.6 : 1,
                                }}
                            >
                                <Group gap="xs" wrap="wrap">
                                    <Text
                                        size="sm"
                                        fw={500}
                                        td={
                                            isReversed
                                                ? "line-through"
                                                : undefined
                                        }
                                        c={isReversed ? "dimmed" : undefined}
                                    >
                                        {potName}
                                    </Text>
                                    {isWriteOff ? (
                                        <Text
                                            size="sm"
                                            c="dimmed"
                                            td={
                                                isReversed
                                                    ? "line-through"
                                                    : undefined
                                            }
                                        >
                                            wrote off{" "}
                                            {formatMoney(
                                                Math.abs(b.movedAmount ?? 0),
                                                money
                                            )}
                                        </Text>
                                    ) : (
                                        <Text
                                            size="sm"
                                            c="dimmed"
                                            td={
                                                isReversed
                                                    ? "line-through"
                                                    : undefined
                                            }
                                        >
                                            {isPartial
                                                ? `moved ${formatMoney(Math.abs(b.movedAmount!), money)} of ${formatMoney(Math.abs(b.totalAmount), money)}`
                                                : formatMoney(
                                                      Math.abs(b.totalAmount),
                                                      money
                                                  )}
                                        </Text>
                                    )}
                                    {!isWriteOff && (
                                        <Text size="xs" c="dimmed">
                                            {b.transactionCount} txn
                                            {b.transactionCount === 1
                                                ? ""
                                                : "s"}
                                        </Text>
                                    )}
                                    {isReversed && (
                                        <Badge
                                            size="sm"
                                            color="sand"
                                            variant="light"
                                        >
                                            Reversed
                                        </Badge>
                                    )}
                                </Group>
                                {!isReversed && (
                                    <Button
                                        size="xs"
                                        variant="default"
                                        onClick={() => void handleUndo(b.id)}
                                        loading={undo.isPending}
                                    >
                                        Undo
                                    </Button>
                                )}
                            </Group>
                        );
                    })}
                </Stack>
            </Stack>
        </Card>
    );
};
