import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { formatMoney } from "@shared/money";
import { useFormatDate, useMoney } from "@/useMoney";
import { Card } from "@/components/shadcn/card";
import { DueBadge } from "@/components/ui/DueBadge";
import {
    vehicleDetails,
    yearlyCost,
    type VehicleWithDetails,
} from "@/features/vehicles/model";

export interface VehicleCardProps {
    vehicle: VehicleWithDetails;
    ownerName: string | null;
    today: string;
}

/** One vehicle on the overview: what's due next and what it costs a year. */
export const VehicleCard = ({ vehicle, ownerName, today }: VehicleCardProps) => {
    const formatDate = useFormatDate();
    const money = useMoney();
    const next = vehicle.dates[0];
    const { logged, bills } = yearlyCost(vehicle, today);

    return (
        <li>
            <Card className="py-0 transition-colors duration-[140ms] ease-out hover:bg-hover">
                <Link
                    to="/vehicles/$vehicle"
                    params={{ vehicle: vehicle.slug }}
                    className="flex items-center gap-3 px-4 py-3.5"
                >
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate font-display text-lg font-medium text-text">
                            {vehicle.name}
                        </span>
                        <span className="truncate text-sm text-text-muted">
                            {vehicleDetails(vehicle, ownerName)}
                        </span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-secondary">
                            {next ? (
                                <>
                                    <span>Next: {next.name}</span>
                                    <DueBadge
                                        dueDate={next.dueDate}
                                        today={today}
                                        formatted={formatDate(next.dueDate)}
                                    />
                                </>
                            ) : (
                                <span className="text-text-muted">
                                    No dates yet
                                </span>
                            )}
                        </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5">
                        <span className="tabular font-display text-fig font-medium text-text">
                            {formatMoney(logged + bills, money)}
                        </span>
                        <span className="text-xs text-text-muted">
                            a year
                        </span>
                    </span>
                    <ChevronRight className="shrink-0 text-text-faint" />
                </Link>
            </Card>
        </li>
    );
};
