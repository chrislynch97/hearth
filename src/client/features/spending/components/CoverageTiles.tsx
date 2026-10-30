import { diffDays, todayIso } from "@shared/dates";
import { orderMembers } from "@/potOptions";
import { ageLabel } from "@/relativeDate";
import { trpc } from "@/trpc";
import { useFormatDate } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import type { Member } from "../model";

export interface CoverageTilesProps {
    members: Member[];
    ownerFilter: string | null;
    onSelectOwner: (ownerId: string | null) => void;
}

/** How far each person's spends are logged up to, naming the last one so you can
 *  tell whether the receipt in your hand is already in. Also how the list gets
 *  filtered to one person. */
export const CoverageTiles = ({
    members,
    ownerFilter,
    onSelectOwner,
}: CoverageTilesProps) => {
    const formatDate = useFormatDate();
    const lastByOwner = trpc.spends.lastByOwner.useQuery().data ?? [];

    const today = todayIso();

    return (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-2 sm:gap-3">
            {orderMembers(members).map((member) => {
                const last = lastByOwner.find((r) => r.ownerId === member.id);
                const active = ownerFilter === member.id;
                return (
                    <Button
                        key={member.id}
                        aria-pressed={active}
                        className={`h-auto min-w-0 flex-col items-start gap-0.5 whitespace-normal rounded-xl p-3 text-left font-normal ${active ? "border-primary bg-primary-tint hover:bg-primary-tint" : ""}`}
                        onClick={() => onSelectOwner(active ? null : member.id)}
                    >
                        <span className="text-base font-semibold text-text">
                            {member.displayName}
                        </span>
                        {last?.lastDate ? (
                            <>
                                <span className="text-sm text-text-secondary">
                                    To {formatDate(last.lastDate)}
                                </span>
                                <span className="text-sm text-text-muted">
                                    {ageLabel(diffDays(last.lastDate, today))}
                                </span>
                                <span className="hidden w-full truncate text-sm text-text-muted sm:block">
                                    {last.lastDescription}
                                </span>
                            </>
                        ) : (
                            <span className="text-sm text-text-muted">
                                None yet
                            </span>
                        )}
                    </Button>
                );
            })}
        </div>
    );
};
