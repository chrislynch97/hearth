import { useState } from "react";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { FormFooter } from "@/components/ui/FormFooter";
import type { VehicleWithDetails } from "@/features/vehicles/model";

export interface VehicleBillFormProps {
    vehicle: VehicleWithDetails;
    /** Every vehicle, to say which a bill is already on. */
    vehicles: VehicleWithDetails[];
    onDone: () => void;
}

/** Picks an existing bill to count against a vehicle. One already on another
 *  vehicle moves here. */
export const VehicleBillForm = ({
    vehicle,
    vehicles,
    onDone,
}: VehicleBillFormProps) => {
    const billsQuery = trpc.expenses.list.useQuery();
    const utils = trpc.useUtils();
    const link = trpc.vehicles.bills.link.useMutation();
    const [picked, setPicked] = useState<string | null>(null);
    const [error, setError] = useState<string>();

    const onVehicle = (billId: string) =>
        vehicles.find((v) => v.bills.some((bill) => bill.id === billId));
    const options = (billsQuery.data ?? [])
        .filter((bill) => onVehicle(bill.id)?.id !== vehicle.id)
        .map((bill) => {
            const other = onVehicle(bill.id);

            return {
                value: bill.id,
                label: other ? `${bill.name} (on ${other.name})` : bill.name,
            };
        });

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!picked) {
            setError("Pick a bill.");
            return;
        }
        try {
            await link.mutateAsync({ vehicleId: vehicle.id, expenseId: picked });
        } catch {
            return; // surfaced by the global error handler; keep the form open
        }
        await utils.vehicles.invalidate();
        notifySuccess(`Linked to ${vehicle.name}.`);
        onDone();
    };

    return (
        <form onSubmit={(event) => void submit(event)}>
            <Combobox
                label="Bill"
                description="Insurance, finance, road tax: anything already in your bills. It still sits with your other bills too."
                options={options}
                value={picked}
                onChange={(value) => {
                    setPicked(value);
                    setError(undefined);
                }}
                placeholder={
                    billsQuery.isLoading
                        ? "Loading bills…"
                        : options.length === 0
                          ? "No bills to link"
                          : "Choose a bill"
                }
                disabled={options.length === 0}
                error={error}
            />

            <FormFooter>
                <Button
                    variant="solid"
                    type="submit"
                    disabled={link.isPending}
                    className="max-sm:h-9 max-sm:w-full"
                >
                    Link bill
                </Button>
            </FormFooter>
        </form>
    );
};
