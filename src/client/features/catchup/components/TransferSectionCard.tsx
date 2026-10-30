import { formatMoney } from "@shared/money";
import type { MoneyFormat } from "@/useMoney";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/shadcn/card";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import type { Transfer, TransferSection } from "../model";
import { useSettle } from "../useSettle";
import { TransferRow } from "./TransferRow";

export interface TransferSectionCardProps {
    section: TransferSection;
    money: MoneyFormat;
    onOpen: (transfer: Transfer) => void;
}

/** Everything going to one person, and the total to send them. */
export const TransferSectionCard = ({
    section,
    money,
    onOpen,
}: TransferSectionCardProps) => {
    const { move, refresh, pending, error } = useSettle();

    const { name, total, transfers } = section;

    const moveAll = async (list: Transfer[]) => {
        for (const { potId, payer, required } of list) {
            await move(potId, payer, Math.abs(required));
        }
        await refresh();
    };

    return (
        <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                <CardTitle>To {name}</CardTitle>
                <span className="tabular ml-auto text-md font-semibold text-text">
                    {total < 0 ? "−" : ""}
                    {formatMoney(Math.abs(total), money)}
                </span>
                {transfers.length > 1 && (
                    <Button
                        compact
                        disabled={pending}
                        className="max-sm:h-9 max-sm:w-full"
                        onClick={() => void moveAll(transfers)}
                    >
                        Mark all moved
                    </Button>
                )}
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                <ul className="-mx-2 flex flex-col divide-y divide-border">
                    {transfers.map((transfer) => (
                        <TransferRow
                            key={transfer.key}
                            transfer={transfer}
                            money={money}
                            disabled={pending}
                            onOpen={() => onOpen(transfer)}
                            onMoved={() => void moveAll([transfer])}
                        />
                    ))}
                </ul>
                {error && <Notice tone="danger" title={error.message} />}
            </CardContent>
        </Card>
    );
};
