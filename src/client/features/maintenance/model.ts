import { diffDays } from "@shared/dates";
import {
    MAINTENANCE_AREAS,
    MAINTENANCE_AREA_LABEL,
    type MaintenanceArea,
} from "@shared/maintenance";
import { repeatLabel, type RepeatUnit } from "@shared/schedule";
import type { MaintenanceJobWithLog } from "../../../server/features/maintenance/maintenance.router";

export type { MaintenanceJobWithLog };

export type MaintenanceLogRow = MaintenanceJobWithLog["log"][number];

/** A month out is "due soon" here: long enough to get a tradesperson booked. */
export const DUE_SOON_DAYS = 30;

export const AREA_OPTIONS = MAINTENANCE_AREAS.map((value) => ({
    value,
    label: MAINTENANCE_AREA_LABEL[value],
}));

export const areaLabel = (area: string): string =>
    MAINTENANCE_AREA_LABEL[area as MaintenanceArea] ?? area;

/** Repeats as one choice, `every:unit`, with `once` for a one-off. */
export const REPEAT_OPTIONS = [
    { value: "1:week", label: "Every week" },
    { value: "2:week", label: "Every 2 weeks" },
    { value: "1:month", label: "Every month" },
    { value: "3:month", label: "Every 3 months" },
    { value: "6:month", label: "Every 6 months" },
    { value: "12:month", label: "Every year" },
    { value: "24:month", label: "Every 2 years" },
    { value: "60:month", label: "Every 5 years" },
    { value: "once", label: "Just once" },
];

export const repeatValue = (every: number | null, unit: string): string =>
    every === null ? "once" : `${every}:${unit}`;

export const parseRepeat = (
    value: string
): { repeatEvery: number | null; repeatUnit: RepeatUnit } => {
    if (value === "once") return { repeatEvery: null, repeatUnit: "month" };
    const [every, unit] = value.split(":");

    return {
        repeatEvery: Number(every),
        repeatUnit: unit === "week" ? "week" : "month",
    };
};

/** A job's own repeat, even one typed in through the API that isn't a preset. */
export const repeatOptionsFor = (every: number | null, unit: string) => {
    const value = repeatValue(every, unit);

    return REPEAT_OPTIONS.some((option) => option.value === value)
        ? REPEAT_OPTIONS
        : [
              ...REPEAT_OPTIONS,
              { value, label: repeatLabel(every, unit as RepeatUnit) },
          ];
};

export interface JobGroups {
    overdue: MaintenanceJobWithLog[];
    soon: MaintenanceJobWithLog[];
    later: MaintenanceJobWithLog[];
    archived: MaintenanceJobWithLog[];
}

/** Live jobs by how pressing they are, soonest first; archived ones apart. */
export const groupJobs = (
    jobs: MaintenanceJobWithLog[],
    today: string
): JobGroups => {
    const groups: JobGroups = {
        overdue: [],
        soon: [],
        later: [],
        archived: [],
    };
    const sorted = [...jobs].sort(
        (a, b) =>
            a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name)
    );
    for (const job of sorted) {
        if (job.archivedAt !== null) {
            groups.archived.push(job);
            continue;
        }
        const days = diffDays(today, job.dueDate);
        if (days < 0) groups.overdue.push(job);
        else if (days <= DUE_SOON_DAYS) groups.soon.push(job);
        else groups.later.push(job);
    }

    return groups;
};

/** Every log entry across the jobs, newest first, carrying its job. */
export const recentlyDone = (
    jobs: MaintenanceJobWithLog[],
    limit: number
): Array<{ job: MaintenanceJobWithLog; entry: MaintenanceLogRow }> =>
    jobs
        .flatMap((job) => job.log.map((entry) => ({ job, entry })))
        .sort(
            (a, b) =>
                b.entry.doneOn.localeCompare(a.entry.doneOn) ||
                b.entry.createdAt.getTime() - a.entry.createdAt.getTime()
        )
        .slice(0, limit);

/** What upkeep cost over the last twelve months. */
export const spentThisYear = (
    jobs: MaintenanceJobWithLog[],
    today: string
): number =>
    jobs
        .flatMap((job) => job.log)
        .filter((entry) => {
            const age = diffDays(entry.doneOn, today);

            return age >= 0 && age < 365;
        })
        .reduce((sum, entry) => sum + (entry.amount ?? 0), 0);
