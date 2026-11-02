import type { ReactNode } from "react";
import { useFormatDate } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { DueBadge } from "@/components/ui/DueBadge";
import { IconSection } from "@/components/ui/IconSection";
import { RecordRow } from "@/components/ui/RecordRow";
import {
    areaLabel,
    type MaintenanceJobWithLog,
} from "@/features/maintenance/model";
import { dueStatus } from "@/lib/due";
import { repeatLabel, type RepeatUnit } from "@shared/schedule";

export interface MaintenanceJobsProps {
    title: string;
    icon: ReactNode;
    jobs: MaintenanceJobWithLog[];
    today: string;
    personName: (id: string | null) => string | null;
    onEdit: (job: MaintenanceJobWithLog) => void;
    onDone: (job: MaintenanceJobWithLog) => void;
}

/** One band of jobs — overdue, due soon, later — each with a way to tick it off. */
export const MaintenanceJobs = ({
    title,
    icon,
    jobs,
    today,
    personName,
    onEdit,
    onDone,
}: MaintenanceJobsProps) => {
    const formatDate = useFormatDate();

    return (
        <IconSection title={title} icon={icon} figure={jobs.length}>
            <ul className="flex flex-col divide-y divide-border">
                {jobs.map((job) => (
                    <RecordRow
                        key={job.id}
                        title={job.name}
                        details={[
                            areaLabel(job.area),
                            repeatLabel(
                                job.repeatEvery,
                                job.repeatUnit as RepeatUnit
                            ),
                            personName(job.assigneeId),
                        ]
                            .filter(Boolean)
                            .join(" · ")}
                        value={formatDate(job.dueDate)}
                        meta={
                            dueStatus(job.dueDate, today) !== "later" && (
                                <DueBadge
                                    dueDate={job.dueDate}
                                    today={today}
                                    formatted={formatDate(job.dueDate)}
                                />
                            )
                        }
                        onClick={() => onEdit(job)}
                        action={
                            <Button compact onClick={() => onDone(job)}>
                                Done
                            </Button>
                        }
                    />
                ))}
            </ul>
        </IconSection>
    );
};
