import { useState } from "react";
import { Center, Divider, Loader, Stack, Title } from "@mantine/core";
import { trpc } from "@/trpc";
import { useMoney } from "@/useMoney";
import { CoverageStrip } from "./CoverageStrip";
import { Register } from "@/features/spending/components/Register";
import { AddSpendForm } from "@/features/spending/components/AddSpendForm";

export function SpendingPage() {
    const membersQuery = trpc.members.list.useQuery();
    const potsQuery = trpc.pots.list.useQuery();

    const money = useMoney();

    // Owned here so the coverage strip can filter the register on click.
    const [ownerFilter, setOwnerFilter] = useState<string | null>(null);

    const members = (membersQuery.data ?? []).filter(
        (m) => m.archivedAt === null
    );
    const pots = potsQuery.data ?? [];

    const isLoading = membersQuery.isLoading || potsQuery.isLoading;

    return (
        <Stack gap="lg" maw={900} mx="auto">
            <Title order={2}>Spending</Title>

            {isLoading && (
                <Center>
                    <Loader size="sm" />
                </Center>
            )}

            {!isLoading && (
                <>
                    <AddSpendForm members={members} pots={pots} money={money} />
                    <Divider />
                    <CoverageStrip
                        members={members}
                        ownerFilter={ownerFilter}
                        onSelectOwner={setOwnerFilter}
                    />
                    <Register
                        members={members}
                        pots={pots}
                        money={money}
                        ownerFilter={ownerFilter}
                        setOwnerFilter={setOwnerFilter}
                    />
                </>
            )}
        </Stack>
    );
}
