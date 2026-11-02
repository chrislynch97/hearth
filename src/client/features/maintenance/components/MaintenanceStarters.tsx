import { useState } from "react";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { Card, CardContent } from "@/components/shadcn/card";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { STARTER_JOBS } from "@shared/maintenance";
import { repeatLabel } from "@shared/schedule";

/** The empty page: the jobs most houses forget, ticked to add in one go. */
export const MaintenanceStarters = () => {
    const utils = trpc.useUtils();
    const addStarters = trpc.maintenance.addStarters.useMutation();
    const [picked, setPicked] = useState<string[]>(
        STARTER_JOBS.map((job) => job.name)
    );

    const toggle = (name: string, on: boolean) =>
        setPicked((current) =>
            on ? [...current, name] : current.filter((n) => n !== name)
        );

    const add = async () => {
        try {
            const added = await addStarters.mutateAsync({ names: picked });
            await utils.maintenance.invalidate();
            notifySuccess(
                `Added ${added} ${added === 1 ? "job" : "jobs"}, all due today. Mark each done once it is.`
            );
        } catch {
            return; // surfaced by the global error handler
        }
    };

    return (
        <Card>
            <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                    <h2 className="font-display text-h3 font-medium text-text">
                        Start with the usual jobs
                    </h2>
                    <p className="text-base text-text-muted">
                        Each starts due today. Mark it done with the date it
                        last happened, and it works out the next one from there.
                    </p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {STARTER_JOBS.map((job) => (
                        <CheckboxField
                            key={job.name}
                            label={job.name}
                            description={repeatLabel(job.every, job.unit)}
                            checked={picked.includes(job.name)}
                            onCheckedChange={(on) => toggle(job.name, on)}
                        />
                    ))}
                </div>
                <div>
                    <Button
                        variant="solid"
                        disabled={picked.length === 0 || addStarters.isPending}
                        className="max-sm:h-9 max-sm:w-full"
                        onClick={() => void add()}
                    >
                        {picked.length === 1
                            ? "Add 1 job"
                            : `Add ${picked.length} jobs`}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};
