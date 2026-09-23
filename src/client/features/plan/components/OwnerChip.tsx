import type { Member } from "../../../../server/db/schema";

export interface OwnerChipProps {
    owner: Member | undefined;
}

/** Whose account the money leaves. A dot in the member's own colour, because the
 *  owner is a constant presence on this page and a full badge on every pot would
 *  shout. */
export const OwnerChip = ({ owner }: OwnerChipProps) => {
    if (!owner) return null;

    return (
        <span className="inline-flex shrink-0 items-center gap-1.5">
            <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: owner.color ?? "var(--color-text-muted)" }}
            />
            <span className="text-xs text-text-muted">{owner.displayName}</span>
        </span>
    );
};
