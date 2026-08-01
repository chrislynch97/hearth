import { useMemo } from "react";
import {
    Card,
    Center,
    Group,
    Loader,
    NavLink,
    Stack,
    Text,
    Title,
} from "@mantine/core";
import { trpc } from "@/trpc";
import { orderMembers } from "@/potOptions";
import { useFormatDate } from "@/useMoney";
import { ageLabel } from "@/relativeDate";
import { diffDays, todayIso } from "@shared/dates";
import type { Member } from "../../server/db/schema";

export interface CoverageStripProps {
    members: Member[];
    ownerFilter: string | null;
    onSelectOwner: (ownerId: string | null) => void;
}

/**
 * How far each person's spends are recorded up to — their latest spend, how long
 * ago that was, and what it was. The gap to today is the backlog you're about to
 * work through, and the name is what tells you whether you already logged the
 * shop you're holding the receipt for. Clicking a row filters the register.
 */
export const CoverageStrip = ({
    members,
    ownerFilter,
    onSelectOwner,
}: CoverageStripProps) => {
    const fmt = useFormatDate();
    const lastByOwnerQuery = trpc.spends.lastByOwner.useQuery();

    const lastByOwner = useMemo(() => {
        const map = new Map<string, { date: string; description: string }>();
        for (const row of lastByOwnerQuery.data ?? []) {
            if (row.lastDate)
                map.set(row.ownerId, {
                    date: row.lastDate,
                    description: row.lastDescription,
                });
        }
        return map;
    }, [lastByOwnerQuery.data]);

    const today = todayIso();
    const orderedMembers = orderMembers(members);

    return (
        <Card withBorder padding="md">
            <Stack gap="xs">
                <Title order={4}>Covered to</Title>
                {lastByOwnerQuery.isLoading ? (
                    <Center>
                        <Loader size="sm" />
                    </Center>
                ) : (
                    <Stack gap={2}>
                        {orderedMembers.map((m) => {
                            const last = lastByOwner.get(m.id);
                            const active = ownerFilter === m.id;
                            return (
                                <NavLink
                                    key={m.id}
                                    active={active}
                                    onClick={() =>
                                        onSelectOwner(active ? null : m.id)
                                    }
                                    label={
                                        <Stack gap={0}>
                                            <Group
                                                justify="space-between"
                                                gap="sm"
                                                wrap="nowrap"
                                            >
                                                <Text fw={500}>
                                                    {m.displayName}
                                                </Text>
                                                {last ? (
                                                    <Text
                                                        size="sm"
                                                        c="dimmed"
                                                        style={{
                                                            whiteSpace:
                                                                "nowrap",
                                                        }}
                                                    >
                                                        covered to{" "}
                                                        {fmt(last.date)} ·{" "}
                                                        {ageLabel(
                                                            diffDays(
                                                                last.date,
                                                                today
                                                            )
                                                        )}
                                                    </Text>
                                                ) : (
                                                    <Text size="sm" c="dimmed">
                                                        none yet
                                                    </Text>
                                                )}
                                            </Group>
                                            {last && (
                                                <Text
                                                    size="xs"
                                                    c="dimmed"
                                                    truncate
                                                >
                                                    {last.description}
                                                </Text>
                                            )}
                                        </Stack>
                                    }
                                />
                            );
                        })}
                    </Stack>
                )}
            </Stack>
        </Card>
    );
};
