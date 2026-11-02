import { formatMoney } from "@shared/money";
import { useFormatDate, useMoney } from "@/useMoney";
import {
    recentlyDone,
    spentThisYear,
    type MaintenanceJobWithLog,
} from "@/features/maintenance/model";

export interface MaintenanceRecentProps {
    jobs: MaintenanceJobWithLog[];
    today: string;
}

/** The side column: what upkeep has cost lately, and what was last done. */
export const MaintenanceRecent = ({ jobs, today }: MaintenanceRecentProps) => {
    const formatDate = useFormatDate();
    const money = useMoney();
    const recent = recentlyDone(jobs, 6);

    return (
        <aside className="flex flex-col gap-5">
            <div className="flex flex-col gap-0.5">
                <span className="text-sm text-text-muted">
                    Spent in the last 12 months
                </span>
                <span className="tabular font-display text-h2 font-medium text-text">
                    {formatMoney(spentThisYear(jobs, today), money)}
                </span>
            </div>

            <div className="flex flex-col gap-1">
                <h2 className="font-display text-h3 font-medium text-text">
                    Done lately
                </h2>
                {recent.length === 0 ? (
                    <p className="text-base text-text-muted">
                        Nothing logged yet. Tap Done on a job once it’s sorted.
                    </p>
                ) : (
                    <ul className="flex flex-col divide-y divide-border">
                        {recent.map(({ job, entry }) => (
                            <li
                                key={entry.id}
                                className="flex items-center justify-between gap-3 py-2.5"
                            >
                                <span className="min-w-0">
                                    <span className="block truncate font-medium text-text">
                                        {job.name}
                                    </span>
                                    <span className="block truncate text-sm text-text-muted">
                                        {formatDate(entry.doneOn)}
                                    </span>
                                </span>
                                {entry.amount !== null && (
                                    <span className="tabular shrink-0 text-text">
                                        {formatMoney(entry.amount, money)}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </aside>
    );
};
