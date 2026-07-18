import type { BacklogPayer } from "../model";
import type { Member } from "../../../../server/db/schema";
import { type MoneyFormat, useFormatDate } from "@/useMoney";
import { trpc } from "@/trpc";
import { useState } from "react";
import { formatMoney, fromMinor, toMinor } from "@shared/money";
import {
    ActionIcon,
    Alert,
    Button,
    Group,
    NumberInput,
    Stack,
    Text,
} from "@mantine/core";

export interface PayerRowProps {
    potId: string;
    payer: BacklogPayer;
    members: Member[];
    money: MoneyFormat;
}

export const PayerRow = ({ potId, payer, members, money }: PayerRowProps) => {
    const utils = trpc.useUtils();
    const fmtDate = useFormatDate();
    const markMoved = trpc.reconcile.markPotMoved.useMutation();
    const clearResidual = trpc.reconcile.clearResidual.useMutation();

    const [open, setOpen] = useState(false);

    // What still needs moving = spends + any residual carried from earlier part-moves.
    const required = payer.total + payer.residual;
    const direction = required < 0 ? -1 : 1;
    const hasSpends = payer.count > 0;
    // The field holds the magnitude actually moved; sign comes from `direction`.
    const [moved, setMoved] = useState<number | string>(
        fromMinor(Math.abs(required), money.decimalPlaces)
    );

    const payerMember = members.find((m) => m.id === payer.ownerId);
    const isJoint = payerMember?.kind === "joint";
    const isPullBack = required < 0;

    const invalidate = () =>
        Promise.all([
            utils.reconcile.backlog.invalidate(),
            utils.reconcile.batches.invalidate(),
            utils.spends.list.invalidate(),
        ]);

    const handleMove = async () => {
        const magnitude =
            moved === "" ? 0 : toMinor(Number(moved), money.decimalPlaces);
        await markMoved.mutateAsync({
            potId,
            ownerId: payer.ownerId,
            movedAmount: direction * magnitude,
        });
        await invalidate();
    };

    const handleClear = async () => {
        await clearResidual.mutateAsync({ potId, ownerId: payer.ownerId });
        await invalidate();
    };

    // "→ Ava" means the money should come back to Ava; joint = it stays in the joint account.
    const arrow = isJoint
        ? "stays with Joint"
        : `→ ${payerMember?.displayName ?? "someone"}`;
    const movedMinor =
        moved === "" ? 0 : toMinor(Number(moved), money.decimalPlaces);
    const overshoot = hasSpends && movedMinor > Math.abs(required);
    const error = markMoved.error ?? clearResidual.error;

    // Residual-only row: no fresh spends, just a shortfall/credit carried over. There
    // are no spends to reconcile, so the only action is to write it off.
    if (!hasSpends) {
        const short = payer.residual > 0;
        return (
            <Stack gap={4}>
                <Group justify="space-between" wrap="nowrap">
                    <Text size="sm" fw={500}>
                        {formatMoney(Math.abs(payer.residual), money)}{" "}
                        {short ? "short" : "credit"} {arrow}
                        <Text span size="xs" c="dimmed">
                            {" "}
                            · carried over
                        </Text>
                    </Text>
                    <Button
                        size="xs"
                        variant="default"
                        onClick={() => void handleClear()}
                        loading={clearResidual.isPending}
                    >
                        Clear
                    </Button>
                </Group>
                {error && (
                    <Alert color="red" title="Error">
                        {error.message}
                    </Alert>
                )}
            </Stack>
        );
    }

    return (
        <Stack gap={4}>
            <Group justify="space-between" wrap="nowrap">
                <Group gap={6} wrap="nowrap">
                    <ActionIcon
                        variant="subtle"
                        size="sm"
                        onClick={() => setOpen((o) => !o)}
                        aria-label="Toggle spends"
                    >
                        {open ? "▾" : "▸"}
                    </ActionIcon>
                    <Text size="sm" fw={500}>
                        {isPullBack ? "Pull back " : ""}
                        {formatMoney(Math.abs(required), money)} {arrow}
                    </Text>
                    <Text size="xs" c="dimmed">
                        {payer.count} spend{payer.count === 1 ? "" : "s"}
                        {payer.residual !== 0 &&
                            ` · incl. ${formatMoney(Math.abs(payer.residual), money)} ${payer.residual > 0 ? "carried over" : "credit"}`}
                    </Text>
                </Group>
                <Group gap={6} wrap="nowrap">
                    <NumberInput
                        aria-label="Amount moved"
                        prefix={money.symbol}
                        decimalScale={money.decimalPlaces}
                        fixedDecimalScale
                        min={0}
                        value={moved}
                        onChange={setMoved}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") void handleMove();
                        }}
                        w={110}
                        size="xs"
                    />
                    <Button
                        size="xs"
                        variant="light"
                        onClick={() => void handleMove()}
                        loading={markMoved.isPending}
                    >
                        Move
                    </Button>
                </Group>
            </Group>
            {overshoot && (
                <Text size="xs" c="dimmed" pl={30}>
                    More than needed — the extra{" "}
                    {formatMoney(movedMinor - Math.abs(required), money)}{" "}
                    becomes a credit next time.
                </Text>
            )}
            {open && (
                <Stack gap={2} pl={30} pb={4}>
                    {payer.spends.map((s) => (
                        <Group key={s.id} justify="space-between" wrap="nowrap">
                            <Text size="xs" c="dimmed" truncate>
                                {fmtDate(s.date)} · {s.description}
                            </Text>
                            <Text size="xs" c="dimmed">
                                {formatMoney(Math.abs(s.amount), money)}
                            </Text>
                        </Group>
                    ))}
                </Stack>
            )}
            {error && (
                <Alert color="red" title="Error">
                    {error.message}
                </Alert>
            )}
        </Stack>
    );
};
