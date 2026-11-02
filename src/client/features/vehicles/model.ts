import { diffDays } from "@shared/dates";
import {
    VEHICLE_COST_KINDS,
    VEHICLE_COST_LABEL,
    VEHICLE_DATE_KINDS,
    VEHICLE_DATE_LABEL,
    VEHICLE_KINDS,
    VEHICLE_KIND_LABEL,
} from "@shared/vehicles";
import type {
    LinkedBill,
    VehicleWithDetails,
} from "../../../server/features/vehicles/vehicles.router";

export type { LinkedBill, VehicleWithDetails };

export type VehicleDateRow = VehicleWithDetails["dates"][number];
export type VehicleCostRow = VehicleWithDetails["costs"][number];

export const KIND_OPTIONS = VEHICLE_KINDS.map((value) => ({
    value,
    label: VEHICLE_KIND_LABEL[value],
}));

export const DATE_KIND_OPTIONS = VEHICLE_DATE_KINDS.map((value) => ({
    value,
    label: VEHICLE_DATE_LABEL[value],
}));

export const COST_KIND_OPTIONS = VEHICLE_COST_KINDS.map((value) => ({
    value,
    label: VEHICLE_COST_LABEL[value],
}));

export const REPEAT_OPTIONS = [
    { value: "12", label: "Every year" },
    { value: "6", label: "Every 6 months" },
    { value: "24", label: "Every 2 years" },
    { value: "36", label: "Every 3 years" },
    { value: "0", label: "Just once" },
];

export const repeatLabel = (months: number | null): string => {
    if (months === null) return "Just once";
    if (months === 12) return "Every year";
    if (months % 12 === 0) return `Every ${months / 12} years`;

    return months === 1 ? "Every month" : `Every ${months} months`;
};

/** "Car · AB12 CDE · Ava's", leaving out what isn't set. */
export const vehicleDetails = (
    vehicle: VehicleWithDetails,
    ownerName: string | null
): string =>
    [
        VEHICLE_KIND_LABEL[vehicle.kind as keyof typeof VEHICLE_KIND_LABEL] ??
            vehicle.kind,
        vehicle.registration,
        ownerName ? `${ownerName}’s` : null,
    ]
        .filter(Boolean)
        .join(" · ");

/** A year's running cost: what was logged in the past twelve months, plus a
 *  year of every linked bill at today's price. */
export const yearlyCost = (
    vehicle: VehicleWithDetails,
    today: string
): { logged: number; bills: number } => ({
    logged: vehicle.costs
        .filter((cost) => {
            const age = diffDays(cost.date, today);

            return age >= 0 && age < 365;
        })
        .reduce((sum, cost) => sum + cost.amount, 0),
    bills: vehicle.bills.reduce((sum, bill) => sum + bill.annual, 0),
});

/** Logged costs by calendar year, newest first. */
export const costsByYear = (
    costs: VehicleCostRow[]
): Array<{ year: string; total: number; costs: VehicleCostRow[] }> => {
    const years = new Map<string, VehicleCostRow[]>();
    for (const cost of costs) {
        const year = cost.date.slice(0, 4);
        years.set(year, [...(years.get(year) ?? []), cost]);
    }

    return [...years.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([year, rows]) => ({
            year,
            total: rows.reduce((sum, cost) => sum + cost.amount, 0),
            costs: rows,
        }));
};

/** Every date across live vehicles, soonest first, for the overview. */
export const comingUp = (
    vehicles: VehicleWithDetails[]
): Array<{ vehicle: VehicleWithDetails; date: VehicleDateRow }> =>
    vehicles
        .filter((vehicle) => vehicle.archivedAt === null)
        .flatMap((vehicle) => vehicle.dates.map((date) => ({ vehicle, date })))
        .sort((a, b) => a.date.dueDate.localeCompare(b.date.dueDate));
