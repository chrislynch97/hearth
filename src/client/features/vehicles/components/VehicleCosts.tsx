import { Wrench } from "lucide-react";
import { formatMoney } from "@shared/money";
import { VEHICLE_COST_LABEL, type VehicleCostKind } from "@shared/vehicles";
import { useFormatDate, useMoney } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { PlusIcon } from "@/components/ui/PlusIcon";
import { VehicleRow } from "@/features/vehicles/components/VehicleRow";
import { VehicleSection } from "@/features/vehicles/components/VehicleSection";
import { costsByYear, type VehicleCostRow } from "@/features/vehicles/model";

export interface VehicleCostsProps {
    costs: VehicleCostRow[];
    onAdd: () => void;
    onEdit: (cost: VehicleCostRow) => void;
}

/** Every one-off cost, a year at a time with the year's total. */
export const VehicleCosts = ({ costs, onAdd, onEdit }: VehicleCostsProps) => {
    const formatDate = useFormatDate();
    const money = useMoney();
    const years = costsByYear(costs);

    return (
        <VehicleSection
            title="Costs"
            icon={<Wrench />}
            action={
                <Button
                    icon={<PlusIcon />}
                    className="max-sm:h-9 max-sm:w-full"
                    onClick={onAdd}
                >
                    Log a cost
                </Button>
            }
        >
            {years.length === 0 && (
                <p className="px-2 py-2.5 text-base text-text-muted">
                    Log the MOT, a service, new tyres or a repair to see what
                    it really costs to run. Ticking off a date can log its cost
                    for you.
                </p>
            )}
            {years.map(({ year, total, costs: rows }) => (
                <div key={year} className="flex flex-col">
                    <div className="flex items-baseline justify-between px-2 pt-2.5 pb-1 text-sm font-medium text-text-muted">
                        <span>{year}</span>
                        <span className="tabular">
                            {formatMoney(total, money)}
                        </span>
                    </div>
                    <ul className="flex flex-col divide-y divide-border">
                        {rows.map((cost) => (
                            <VehicleRow
                                key={cost.id}
                                title={
                                    VEHICLE_COST_LABEL[
                                        cost.kind as VehicleCostKind
                                    ] ?? cost.kind
                                }
                                details={[formatDate(cost.date), cost.note]
                                    .filter(Boolean)
                                    .join(" · ")}
                                value={formatMoney(cost.amount, money)}
                                onClick={() => onEdit(cost)}
                            />
                        ))}
                    </ul>
                </div>
            ))}
        </VehicleSection>
    );
};
