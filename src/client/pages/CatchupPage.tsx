import {
    Alert,
    Button,
    Card,
    Center,
    Group,
    Loader,
    Stack,
    Text,
    Title,
} from "@mantine/core";
import { Link } from "react-router-dom";
import { trpc } from "@/trpc";
import { formatMoney } from "@shared/money";
import { useMoney } from "@/useMoney";
import { HistorySection } from "@/features/catchup/components/HistorySection";
import { PotBacklogRow } from "@/features/catchup/components/PotBacklogRow";

// ---------------------------------------------------------------------------
// CatchupPage
// ---------------------------------------------------------------------------

export const CatchupPage = () => {
    const membersQuery = trpc.members.list.useQuery();
    const backlogQuery = trpc.reconcile.backlog.useQuery();

    const money = useMoney();

    const members = membersQuery.data ?? [];
    const backlog = backlogQuery.data;

    const isLoading = membersQuery.isLoading || backlogQuery.isLoading;

    const hasBacklog =
        !!backlog &&
        (backlog.perPot.length > 0 || backlog.unassigned.count > 0);

    return (
        <Stack gap="lg" maw={900} mx="auto">
            <Title order={2}>Catch-up</Title>

            {isLoading && (
                <Center>
                    <Loader size="sm" />
                </Center>
            )}

            {!isLoading && backlog && (
                <>
                    {hasBacklog ? (
                        <Alert color="apricot" title="Reconciliation needed">
                            You need to move{" "}
                            {formatMoney(Math.abs(backlog.grandTotal), money)}{" "}
                            across {backlog.perPot.length} pot
                            {backlog.perPot.length === 1 ? "" : "s"}.
                        </Alert>
                    ) : (
                        <Alert color="moss" title="All caught up">
                            Nothing to reconcile right now.
                        </Alert>
                    )}

                    {backlog.unassigned.count > 0 && (
                        <Card withBorder padding="sm">
                            <Group justify="space-between" wrap="wrap">
                                <Text size="sm">
                                    {backlog.unassigned.count} spend
                                    {backlog.unassigned.count === 1
                                        ? ""
                                        : "s"}{" "}
                                    need
                                    {backlog.unassigned.count === 1
                                        ? "s"
                                        : ""}{" "}
                                    a pot (
                                    {formatMoney(
                                        Math.abs(backlog.unassigned.total),
                                        money
                                    )}
                                    )
                                </Text>
                                <Button
                                    component={Link}
                                    to="/spending"
                                    size="xs"
                                    variant="light"
                                >
                                    Assign pots
                                </Button>
                            </Group>
                        </Card>
                    )}

                    {backlog.perPot.length > 0 && (
                        <Stack gap="sm">
                            {backlog.perPot.map((p) => (
                                <PotBacklogRow
                                    key={p.potId}
                                    pot={p}
                                    members={members}
                                    money={money}
                                />
                            ))}
                        </Stack>
                    )}

                    <HistorySection money={money} />
                </>
            )}
        </Stack>
    );
};
