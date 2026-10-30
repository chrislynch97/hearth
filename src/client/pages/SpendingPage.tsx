import { useState } from "react";
import { getRouteApi } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { todayIso } from "@shared/dates";
import { orderMembers } from "@/potOptions";
import { trpc } from "@/trpc";
import { useMoney } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import {
    AddSpendDialog,
    type SpendDefaults,
} from "@/features/spending/components/AddSpendDialog";
import { CoverageTiles } from "@/features/spending/components/CoverageTiles";
import { Register } from "@/features/spending/components/Register";

const route = getRouteApi("/spending");

/** What's been spent, with logging a new one a tap away. */
export const SpendingPage = () => {
    const money = useMoney();
    const { status } = route.useSearch();
    const membersQuery = trpc.members.list.useQuery();
    const potsQuery = trpc.pots.list.useQuery();
    const [ownerFilter, setOwnerFilter] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const [carried, setCarried] = useState<SpendDefaults | null>(null);

    const members = (membersQuery.data ?? []).filter(
        (m) => m.archivedAt === null
    );
    const pots = potsQuery.data ?? [];
    const isLoading = membersQuery.isLoading || potsQuery.isLoading;

    return (
        <div className="hearth-ds mx-auto flex max-w-[1000px] flex-col gap-5">
            <PageHeader
                title="Spending"
                actions={
                    <Button
                        variant="solid"
                        icon={<Plus />}
                        className="max-sm:h-9 max-sm:w-full"
                        onClick={() => setAdding(true)}
                    >
                        Add spend
                    </Button>
                }
            />
            {isLoading ? (
                <Spinner label="Loading spending" />
            ) : (
                <>
                    <CoverageTiles
                        members={members}
                        ownerFilter={ownerFilter}
                        onSelectOwner={setOwnerFilter}
                    />
                    <Register
                        members={members}
                        pots={pots}
                        money={money}
                        ownerFilter={ownerFilter}
                        initialStatus={status ?? "all"}
                    />
                </>
            )}
            {adding && (
                <AddSpendDialog
                    defaults={
                        carried ?? {
                            ownerId: orderMembers(members)[0]?.id ?? null,
                            date: todayIso(),
                        }
                    }
                    members={members}
                    pots={pots}
                    money={money}
                    onClose={() => setAdding(false)}
                    onLogged={setCarried}
                />
            )}
        </div>
    );
};
