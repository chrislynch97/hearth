import { ReceiptText, X } from "lucide-react";
import { formatMoney } from "@shared/money";
import { useMoney } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { PlusIcon } from "@/components/ui/PlusIcon";
import { VehicleRow } from "@/features/vehicles/components/VehicleRow";
import { VehicleSection } from "@/features/vehicles/components/VehicleSection";
import type { LinkedBill } from "@/features/vehicles/model";

export interface VehicleBillsProps {
    bills: LinkedBill[];
    onLink: () => void;
    onOpen: () => void;
    onUnlink: (bill: LinkedBill) => void;
    /** The bill being unlinked, while it is. */
    unlinking: string | undefined;
}

const PER: Record<string, string> = {
    monthly: "a month",
    quarterly: "a quarter",
    yearly: "a year",
};

/** The household's existing bills that pay for this vehicle. */
export const VehicleBills = ({
    bills,
    onLink,
    onOpen,
    onUnlink,
    unlinking,
}: VehicleBillsProps) => {
    const money = useMoney();
    const annual = bills.reduce((sum, bill) => sum + bill.annual, 0);

    return (
        <VehicleSection
            title="Bills"
            icon={<ReceiptText />}
            figure={
                bills.length > 0 && `${formatMoney(annual, money)} a year`
            }
            action={
                <Button
                    icon={<PlusIcon />}
                    className="max-sm:h-9 max-sm:w-full"
                    onClick={onLink}
                >
                    Link a bill
                </Button>
            }
        >
            {bills.length === 0 ? (
                <p className="px-2 py-2.5 text-base text-text-muted">
                    Link the insurance, finance or road tax you already pay as
                    bills, so they count towards what it costs.
                </p>
            ) : (
                <ul className="flex flex-col divide-y divide-border">
                    {bills.map((bill) => (
                        <VehicleRow
                            key={bill.id}
                            title={bill.name}
                            details={
                                bill.archived
                                    ? "No longer paid"
                                    : `${formatMoney(bill.amount, money)} ${PER[bill.recurrence] ?? bill.recurrence}`
                            }
                            value={formatMoney(bill.annual, money)}
                            onClick={onOpen}
                            action={
                                <Button
                                    variant="ghost"
                                    compact
                                    aria-label={`Unlink ${bill.name}`}
                                    title="Unlink"
                                    className="shrink-0"
                                    disabled={unlinking === bill.id}
                                    onClick={() => onUnlink(bill)}
                                >
                                    <X />
                                </Button>
                            }
                        />
                    ))}
                </ul>
            )}
        </VehicleSection>
    );
};
