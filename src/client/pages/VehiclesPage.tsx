import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { todayIso } from "@shared/dates";
import { trpc } from "@/trpc";
import { useFormatDate } from "@/useMoney";
import { Card, CardContent } from "@/components/shadcn/card";
import { Button } from "@/components/ui/Button";
import { EditorPanel } from "@/components/ui/EditorPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { PlusIcon } from "@/components/ui/PlusIcon";
import { Spinner } from "@/components/ui/Spinner";
import { DueBadge } from "@/components/ui/DueBadge";
import { ArchivedGroup } from "@/components/ui/ArchivedGroup";
import { VehicleCard } from "@/features/vehicles/components/VehicleCard";
import { VehicleForm } from "@/features/vehicles/components/VehicleForm";
import { comingUp } from "@/features/vehicles/model";

/** Every vehicle the household runs, and what's coming up across them. */
export const VehiclesPage = () => {
    const vehiclesQuery = trpc.vehicles.list.useQuery();
    const membersQuery = trpc.members.list.useQuery();
    const navigate = useNavigate();
    const formatDate = useFormatDate();

    const [adding, setAdding] = useState(false);
    const [exiting, setExiting] = useState(false);

    const vehicles = vehiclesQuery.data ?? [];
    const live = vehicles.filter((v) => v.archivedAt === null);
    const archived = vehicles.filter((v) => v.archivedAt !== null);
    const members = membersQuery.data ?? [];
    const persons = members.filter(
        (m) => m.kind === "person" && m.archivedAt === null
    );
    const ownerName = (id: string | null) =>
        members.find((m) => m.id === id && m.kind === "person")
            ?.displayName ?? null;
    const upcoming = comingUp(vehicles).slice(0, 8);
    const today = todayIso();

    const close = () => setExiting(true);
    const finishClose = () => {
        setExiting(false);
        setAdding(false);
    };

    return (
        <div className="hearth-ds mx-auto flex max-w-[1040px] flex-col gap-6 text-base">
            <PageHeader
                title="Vehicles"
                description="MOTs, renewals and what each one really costs to run."
                actions={
                    <Button
                        icon={<PlusIcon />}
                        className="max-sm:h-9 max-sm:w-full"
                        onClick={() => setAdding(true)}
                    >
                        Add vehicle
                    </Button>
                }
            />

            {vehiclesQuery.isLoading && <Spinner label="Loading vehicles" />}

            {!vehiclesQuery.isLoading && vehicles.length === 0 && (
                <Card>
                    <CardContent className="text-base text-text-muted">
                        Add a car, motorbike or campervan. Then give it its MOT
                        and renewal dates for a nudge before each, and log what
                        it costs along the way.
                    </CardContent>
                </Card>
            )}

            {vehicles.length > 0 && (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-10">
                    <div className="flex min-w-0 flex-col gap-6">
                        <ul className="m-0 flex list-none flex-col gap-2 p-0">
                            {live.map((vehicle) => (
                                <VehicleCard
                                    key={vehicle.id}
                                    vehicle={vehicle}
                                    ownerName={ownerName(vehicle.ownerId)}
                                    today={today}
                                />
                            ))}
                        </ul>
                        {archived.length > 0 && (
                            <ArchivedGroup count={archived.length}>
                                {archived.map((vehicle) => (
                                    <VehicleCard
                                        key={vehicle.id}
                                        vehicle={vehicle}
                                        ownerName={ownerName(vehicle.ownerId)}
                                        today={today}
                                    />
                                ))}
                            </ArchivedGroup>
                        )}
                    </div>

                    <aside className="flex flex-col gap-2">
                        <h2 className="font-display text-h3 font-medium text-text">
                            Coming up
                        </h2>
                        {upcoming.length === 0 ? (
                            <p className="text-base text-text-muted">
                                Nothing dated yet.
                            </p>
                        ) : (
                            <ul className="flex flex-col divide-y divide-border">
                                {upcoming.map(({ vehicle, date }) => (
                                    <li key={date.id}>
                                        <Link
                                            to="/vehicles/$vehicle"
                                            params={{ vehicle: vehicle.slug }}
                                            className="flex items-center justify-between gap-3 py-2.5 hover:text-primary"
                                        >
                                            <span className="min-w-0">
                                                <span className="block truncate font-medium">
                                                    {date.name}
                                                </span>
                                                <span className="block truncate text-sm text-text-muted">
                                                    {vehicle.name}
                                                </span>
                                            </span>
                                            <DueBadge
                                                dueDate={date.dueDate}
                                                today={today}
                                                formatted={formatDate(
                                                    date.dueDate
                                                )}
                                            />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </aside>
                </div>
            )}

            {adding && (
                <EditorPanel
                    title="New vehicle"
                    exiting={exiting}
                    onExited={finishClose}
                    onClose={close}
                >
                    <VehicleForm
                        vehicle={undefined}
                        persons={persons}
                        onCreated={(slug) =>
                            void navigate({
                                to: "/vehicles/$vehicle",
                                params: { vehicle: slug },
                            })
                        }
                        onArchived={() => undefined}
                        onDone={close}
                    />
                </EditorPanel>
            )}
        </div>
    );
};
