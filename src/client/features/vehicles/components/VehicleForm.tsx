import { useForm } from "react-hook-form";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { ArchiveAction } from "@/components/ui/ArchiveAction";
import { Button } from "@/components/ui/Button";
import { FormChoiceField } from "@/components/ui/FormChoiceField";
import { FormFooter } from "@/components/ui/FormFooter";
import { TextField } from "@/components/ui/TextField";
import { KIND_OPTIONS, type VehicleWithDetails } from "@/features/vehicles/model";
import { DEFAULT_VEHICLE_KIND, type VehicleKind } from "@shared/vehicles";

export interface VehicleFormProps {
    /** Absent when adding. */
    vehicle: VehicleWithDetails | undefined;
    /** People who can own one; the joint entity is "Shared". */
    persons: Array<{ id: string; displayName: string }>;
    onCreated: (slug: string) => void;
    onArchived: () => void;
    onDone: () => void;
}

interface VehicleFormValues {
    name: string;
    kind: VehicleKind;
    registration: string;
    ownerId: string;
}

export const VehicleForm = ({
    vehicle,
    persons,
    onCreated,
    onArchived,
    onDone,
}: VehicleFormProps) => {
    const utils = trpc.useUtils();
    const create = trpc.vehicles.create.useMutation();
    const update = trpc.vehicles.update.useMutation();

    const {
        register,
        control,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<VehicleFormValues>({
        defaultValues: {
            name: vehicle?.name ?? "",
            kind: (vehicle?.kind as VehicleKind | undefined) ?? DEFAULT_VEHICLE_KIND,
            registration: vehicle?.registration ?? "",
            ownerId: vehicle?.ownerId ?? "",
        },
    });

    const submit = handleSubmit(async (values) => {
        const fields = {
            name: values.name.trim(),
            kind: values.kind,
            registration: values.registration.trim() || null,
            ownerId: values.ownerId || null,
        };
        let createdSlug: string | undefined;

        try {
            if (vehicle) {
                await update.mutateAsync({
                    id: vehicle.id,
                    expectedUpdatedAt: vehicle.updatedAt,
                    ...fields,
                });
            } else {
                createdSlug = (await create.mutateAsync(fields)).slug;
            }
        } catch {
            return; // surfaced by the global error handler; keep the form open
        }
        await utils.vehicles.invalidate();
        notifySuccess(vehicle ? `Saved ${fields.name}.` : `Added ${fields.name}.`);
        if (createdSlug) onCreated(createdSlug);
        onDone();
    });

    const setArchived = async (archived: boolean) => {
        if (!vehicle) return;
        try {
            await update.mutateAsync({
                id: vehicle.id,
                expectedUpdatedAt: vehicle.updatedAt,
                archived,
            });
        } catch {
            return;
        }
        await utils.vehicles.invalidate();
        notifySuccess(
            archived ? `Archived ${vehicle.name}.` : `Restored ${vehicle.name}.`
        );
        if (archived) onArchived();
        onDone();
    };

    const archived = vehicle?.archivedAt != null;
    const ownerOptions = persons.map((person) => ({
        value: person.id,
        label: person.displayName,
    }));

    return (
        <form onSubmit={submit}>
            <div className="flex flex-col gap-3.5">
                <TextField
                    label="Name"
                    placeholder="e.g. The Golf"
                    error={errors.name?.message}
                    {...register("name", {
                        validate: (value) =>
                            value.trim().length > 0 || "Give it a name.",
                    })}
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <FormChoiceField
                        control={control}
                        name="kind"
                        label="Type"
                        options={KIND_OPTIONS}
                    />
                    <TextField
                        label="Registration"
                        placeholder="Optional"
                        className="uppercase"
                        {...register("registration")}
                    />
                </div>
                <FormChoiceField
                    control={control}
                    name="ownerId"
                    label="Whose"
                    emptyLabel="Shared"
                    description="Reminders go to them. Shared ones go to everyone."
                    options={ownerOptions}
                />
            </div>

            <FormFooter
                aside={
                    vehicle &&
                    (archived ? (
                        <Button
                            className="max-sm:h-9"
                            disabled={update.isPending}
                            onClick={() => void setArchived(false)}
                        >
                            Restore
                        </Button>
                    ) : (
                        <ArchiveAction
                            label="Archive"
                            consequence="Sold or scrapped: its reminders stop and it leaves the calendar. Its history stays."
                            pending={update.isPending}
                            onArchive={() => void setArchived(true)}
                        />
                    ))
                }
            >
                <Button
                    variant="solid"
                    type="submit"
                    disabled={isSubmitting}
                    className="max-sm:h-9 max-sm:w-full"
                >
                    {vehicle ? "Save changes" : "Add vehicle"}
                </Button>
            </FormFooter>
        </form>
    );
};
