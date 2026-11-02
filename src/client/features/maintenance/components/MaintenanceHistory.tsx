import { formatMoney } from "@shared/money";
import { useFormatDate, useMoney } from "@/useMoney";
import { RecordRow } from "@/components/ui/RecordRow";
import type { MaintenanceLogRow } from "@/features/maintenance/model";

export interface MaintenanceHistoryProps {
    log: MaintenanceLogRow[];
    personName: (id: string | null) => string | null;
    onPick: (entry: MaintenanceLogRow) => void;
}

/** Every time a job was done, newest first, under its edit form. */
export const MaintenanceHistory = ({
    log,
    personName,
    onPick,
}: MaintenanceHistoryProps) => {
    const formatDate = useFormatDate();
    const money = useMoney();

    return (
        <section className="mt-6 flex flex-col gap-1 border-t border-border pt-4">
            <h3 className="text-md font-medium text-text">History</h3>
            <ul className="-mx-2.5 flex flex-col divide-y divide-border">
                {log.map((entry) => (
                    <RecordRow
                        key={entry.id}
                        title={formatDate(entry.doneOn)}
                        details={
                            [personName(entry.doneById), entry.note]
                                .filter(Boolean)
                                .join(" · ") || undefined
                        }
                        value={
                            entry.amount === null
                                ? ""
                                : formatMoney(entry.amount, money)
                        }
                        onClick={() => onPick(entry)}
                    />
                ))}
            </ul>
        </section>
    );
};
