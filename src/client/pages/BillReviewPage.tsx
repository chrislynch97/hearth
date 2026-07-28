import { useMemo, useState } from "react";
import {
    Badge,
    Card,
    Center,
    Divider,
    Group,
    Loader,
    SegmentedControl,
    Stack,
    Text,
    Title,
    Tooltip,
} from "@mantine/core";
import { trpc } from "@/trpc";
import { useMoney, formatSignedPercent, type MoneyFormat } from "@/useMoney";
import { formatMoney } from "@shared/money";
import { sortBillReview, type BillReviewSort } from "@shared/billReview";
import type { BillReviewRow } from "../../server/features/budget/billReview";

const SORT_OPTIONS = [
    { value: "annual", label: "By £/yr" },
    { value: "percent", label: "By %" },
];

/** `+£24.00` / `-£12.00` — formatMoney already leads a negative with its own `-`. */
const signedMoney = (minor: number, money: MoneyFormat): string =>
    `${minor > 0 ? "+" : ""}${formatMoney(minor, money)}`;

const ChangeCell = ({
    row,
    money,
}: {
    row: BillReviewRow;
    money: MoneyFormat;
}) => {
    const grew = row.changeAnnual > 0;
    const fell = row.changeAnnual < 0;

    if (!grew && !fell) {
        // Flat, or never recorded — either way, nothing to worry about.
        return (
            <Tooltip
                label={
                    row.hasHistory
                        ? "Unchanged over its recorded history"
                        : "No price history recorded yet"
                }
                withArrow
            >
                <Text size="sm" c="dimmed">
                    —
                </Text>
            </Tooltip>
        );
    }

    const color = grew ? "red" : "teal";

    return (
        <Group gap="xs" wrap="nowrap" justify="flex-end">
            {row.changePct !== null && (
                <Badge color={color} variant="light" size="lg">
                    {formatSignedPercent(row.changePct * 100)}
                </Badge>
            )}
            <Text
                size="sm"
                fw={600}
                c={color}
                style={{ minWidth: 88, textAlign: "right" }}
            >
                {signedMoney(row.changeAnnual, money)}/yr
            </Text>
        </Group>
    );
};

const ReviewRow = ({
    row,
    money,
}: {
    row: BillReviewRow;
    money: MoneyFormat;
}) => {
    const creeping =
        row.riseCount >= 2 &&
        row.creepPct !== null &&
        row.firstObserved !== null;

    return (
        <Group justify="space-between" wrap="nowrap" align="flex-start">
            <Stack gap={2}>
                <Group gap="xs" wrap="wrap">
                    <Text fw={600}>{row.name}</Text>
                    {row.recurrence !== "monthly" && (
                        <Badge size="sm" variant="light">
                            {row.recurrence}
                        </Badge>
                    )}
                    {row.source === "actual" && (
                        <Tooltip
                            label="Based on what you actually paid, not the recorded bill amount"
                            withArrow
                        >
                            <Badge size="sm" variant="light" color="grape">
                                from payments
                            </Badge>
                        </Tooltip>
                    )}
                </Group>
                <Text size="sm" c="dimmed">
                    {formatMoney(row.currentMonthly, money)}/mo
                </Text>
                {creeping && (
                    <Text size="xs" c="orange.7">
                        ↑ Risen {row.riseCount}× ·{" "}
                        {formatSignedPercent(row.creepPct! * 100, 0)} since{" "}
                        {row.firstObserved!.slice(0, 4)}
                    </Text>
                )}
            </Stack>
            <ChangeCell row={row} money={money} />
        </Group>
    );
};

export const BillReviewPage = () => {
    const reviewQuery = trpc.billReview.review.useQuery();
    const money = useMoney();

    const [sort, setSort] = useState<BillReviewSort>("annual");

    const rows = useMemo(
        () => sortBillReview(reviewQuery.data ?? [], sort),
        [reviewQuery.data, sort]
    );

    const isLoading = reviewQuery.isLoading;

    return (
        <Stack gap="lg" maw={900} mx="auto">
            <div>
                <Title order={2}>Bill review</Title>
                <Text size="sm" c="dimmed">
                    Your bills and subscriptions ranked by how much they've
                    grown over the last 12 months — the fastest climbers, not
                    the biggest, are the ones worth a second look.
                </Text>
            </div>

            {isLoading && (
                <Center>
                    <Loader size="sm" />
                </Center>
            )}

            {!isLoading && rows.length === 0 && (
                <Text c="dimmed">
                    No active bills to review yet — add some on the Bills page.
                </Text>
            )}

            {!isLoading && rows.length > 0 && (
                <>
                    <Group justify="space-between" align="center" wrap="wrap">
                        <Text size="sm" c="dimmed">
                            Sort by
                        </Text>
                        <SegmentedControl
                            size="sm"
                            data={SORT_OPTIONS}
                            value={sort}
                            onChange={(v) => setSort(v as BillReviewSort)}
                        />
                    </Group>
                    <Card withBorder padding="md">
                        <Stack gap="sm">
                            {rows.map((row, i) => (
                                <div key={row.id}>
                                    {i > 0 && <Divider mb="sm" />}
                                    <ReviewRow row={row} money={money} />
                                </div>
                            ))}
                        </Stack>
                    </Card>
                </>
            )}
        </Stack>
    );
};
