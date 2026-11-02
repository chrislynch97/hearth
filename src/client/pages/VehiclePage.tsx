import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { todayIso } from "@shared/dates";
import { formatMoney } from "@shared/money";
import { shortIdOf } from "@shared/slug";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { useFormatDate, useMoney } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { EditorPanel } from "@/components/ui/EditorPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import { StatFigure } from "@/components/ui/StatFigure";
import { VehicleBillForm } from "@/features/vehicles/components/VehicleBillForm";
import { VehicleBills } from "@/features/vehicles/components/VehicleBills";
import { VehicleCostForm } from "@/features/vehicles/components/VehicleCostForm";
import { VehicleCosts } from "@/features/vehicles/components/VehicleCosts";
import { VehicleDateForm } from "@/features/vehicles/components/VehicleDateForm";
import { VehicleDates } from "@/features/vehicles/components/VehicleDates";
import { VehicleDoneForm } from "@/features/vehicles/components/VehicleDoneForm";
import { VehicleForm } from "@/features/vehicles/components/VehicleForm";
import {
    vehicleDetails,
    yearlyCost,
    type LinkedBill,
    type VehicleCostRow,
    type VehicleDateRow,
} from "@/features/vehicles/model";

type Editor =
    | { kind: "vehicle" }
    | { kind: "date"; date: VehicleDateRow | undefined }
    | { kind: "done"; date: VehicleDateRow }
    | { kind: "cost"; cost: VehicleCostRow | undefined }
    | { kind: "bill" };

const editorTitle = (editor: Editor): string => {
    switch (editor.kind) {
        case "vehicle":
            return "Edit vehicle";
        case "date":
            return editor.date ? "Edit date" : "New date";
        case "done":
            return `${editor.date.name} done`;
        case "cost":
            return editor.cost ? "Edit cost" : "Log a cost";
        case "bill":
            return "Link a bill";
    }
};

/** One vehicle: its dates, what it's cost, and the bills that pay for it.
 *  `/vehicles/k3x9p2-golf`; the short id finds it. */
export const VehiclePage = () => {
    const vehiclesQuery = trpc.vehicles.list.useQuery();
    const membersQuery = trpc.members.list.useQuery();
    const pushConfig = trpc.notifications.config.useQuery();
    const utils = trpc.useUtils();
    const unlink = trpc.vehicles.bills.unlink.useMutation();
    const navigate = useNavigate();
    const formatDate = useFormatDate();
    const money = useMoney();
    const key = useParams({ strict: false }).vehicle ?? "";

    const [editor, setEditor] = useState<Editor | null>(null);
    const [exiting, setExiting] = useState(false);

    const vehicles = vehiclesQuery.data ?? [];
    const vehicle = vehicles.find((v) => v.shortId === shortIdOf(key));
    const members = membersQuery.data ?? [];
    const persons = members.filter(
        (m) =>
            m.kind === "person" &&
            (m.archivedAt === null || m.id === vehicle?.ownerId)
    );
    const ownerName =
        persons.find((m) => m.id === vehicle?.ownerId)?.displayName ?? null;
    const today = todayIso();

    useEffect(() => {
        // A stale name after the short id (a rename, an old link) becomes the
        // vehicle's current one.
        if (vehicle && key !== vehicle.slug)
            void navigate({
                to: "/vehicles/$vehicle",
                params: { vehicle: vehicle.slug },
                replace: true,
            });
    }, [vehicle, key, navigate]);

    const close = () => setExiting(true);
    const finishClose = () => {
        setExiting(false);
        setEditor(null);
    };

    const unlinkBill = async (bill: LinkedBill) => {
        try {
            await unlink.mutateAsync({ expenseId: bill.id });
        } catch {
            return;
        }
        await utils.vehicles.invalidate();
        notifySuccess(`Unlinked ${bill.name}.`);
    };

    if (vehiclesQuery.isLoading) return <Spinner label="Loading vehicle" />;

    if (!vehicle)
        return (
            <div className="hearth-ds mx-auto flex max-w-[1040px] flex-col gap-3 text-base">
                <PageHeader title="Vehicle not found" />
                <p className="text-text-muted">
                    It may have been removed.{" "}
                    <Link to="/vehicles" className="text-primary underline">
                        Back to vehicles
                    </Link>
                </p>
            </div>
        );

    const { logged, bills } = yearlyCost(vehicle, today);
    const next = vehicle.dates[0];
    const live = vehicle.archivedAt === null;

    return (
        <div className="hearth-ds mx-auto flex max-w-[1040px] flex-col gap-6 text-base">
            <div className="flex flex-col gap-2">
                <Link
                    to="/vehicles"
                    className="flex w-fit items-center gap-1 text-sm text-text-muted hover:text-text"
                >
                    <ChevronLeft className="size-4" />
                    Vehicles
                </Link>
                <PageHeader
                    title={vehicle.name}
                    description={
                        live
                            ? vehicleDetails(vehicle, ownerName)
                            : `${vehicleDetails(vehicle, ownerName)} · Archived`
                    }
                    actions={
                        <Button
                            className="max-sm:h-9 max-sm:w-full"
                            onClick={() => setEditor({ kind: "vehicle" })}
                        >
                            Edit vehicle
                        </Button>
                    }
                />
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
                <StatFigure
                    label="Running cost a year"
                    value={formatMoney(logged + bills, money)}
                    hint={`${formatMoney(logged, money)} logged in the past year, plus bills`}
                />
                <StatFigure
                    label="Bills a year"
                    value={formatMoney(bills, money)}
                    hint={`${vehicle.bills.length} linked`}
                />
                <StatFigure
                    label="Next up"
                    value={next ? next.name : "Nothing"}
                    hint={next ? formatDate(next.dueDate) : "No dates yet"}
                />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8">
                <div className="flex min-w-0 flex-col gap-6">
                    <VehicleDates
                        dates={vehicle.dates}
                        today={today}
                        onAdd={
                            live
                                ? () =>
                                      setEditor({ kind: "date", date: undefined })
                                : undefined
                        }
                        onEdit={(date) => setEditor({ kind: "date", date })}
                        onDone={(date) => setEditor({ kind: "done", date })}
                    />
                    <VehicleCosts
                        costs={vehicle.costs}
                        onAdd={() => setEditor({ kind: "cost", cost: undefined })}
                        onEdit={(cost) => setEditor({ kind: "cost", cost })}
                    />
                </div>
                <aside className="flex min-w-0 flex-col gap-6">
                    <VehicleBills
                        bills={vehicle.bills}
                        onLink={() => setEditor({ kind: "bill" })}
                        onOpen={() => void navigate({ to: "/plan" })}
                        onUnlink={(bill) => void unlinkBill(bill)}
                        unlinking={
                            unlink.isPending
                                ? unlink.variables?.expenseId
                                : undefined
                        }
                    />
                </aside>
            </div>

            {editor && (
                <EditorPanel
                    title={editorTitle(editor)}
                    subtitle={vehicle.name}
                    exiting={exiting}
                    focusField={
                        editor.kind === "done" ||
                        (editor.kind === "date" && !editor.date) ||
                        (editor.kind === "cost" && !editor.cost)
                    }
                    onExited={finishClose}
                    onClose={close}
                >
                    {editor.kind === "vehicle" && (
                        <VehicleForm
                            vehicle={vehicle}
                            persons={persons}
                            onCreated={() => undefined}
                            onArchived={() =>
                                void navigate({ to: "/vehicles" })
                            }
                            onDone={close}
                        />
                    )}
                    {editor.kind === "date" && (
                        <VehicleDateForm
                            key={editor.date?.id ?? "new"}
                            vehicleId={vehicle.id}
                            date={editor.date}
                            canRemind={pushConfig.data?.enabled ?? false}
                            onDone={close}
                        />
                    )}
                    {editor.kind === "done" && (
                        <VehicleDoneForm date={editor.date} onDone={close} />
                    )}
                    {editor.kind === "cost" && (
                        <VehicleCostForm
                            key={editor.cost?.id ?? "new"}
                            vehicleId={vehicle.id}
                            cost={editor.cost}
                            onDone={close}
                        />
                    )}
                    {editor.kind === "bill" && (
                        <VehicleBillForm
                            vehicle={vehicle}
                            vehicles={vehicles}
                            onDone={close}
                        />
                    )}
                </EditorPanel>
            )}
        </div>
    );
};
