import { ALL } from "@/features/plan/model";
import type { Member } from "../../../../server/db/schema";

export interface OwnerFilterProps {
    members: Member[];
    /** `ALL` or a member id. */
    selected: string;
    onSelect: (value: string) => void;
}

const chipClass = (active: boolean) =>
    [
        "h-[26px] rounded-full border px-2.5 text-xs transition-colors duration-[140ms] ease-out",
        active
            ? "border-primary bg-primary-tint font-semibold text-primary"
            : "border-border text-text-secondary hover:bg-hover",
    ].join(" ");

/** Narrows the plan to one person's pots. Main-account bills belong to the
 *  household, so they stay put whoever is selected. */
export const OwnerFilter = ({
    members,
    selected,
    onSelect,
}: OwnerFilterProps) => (
    <div className="flex flex-wrap items-center gap-1.5">
        <button
            onClick={() => onSelect(ALL)}
            aria-pressed={selected === ALL}
            className={chipClass(selected === ALL)}
        >
            Everyone
        </button>
        {members.map((member) => (
            <button
                key={member.id}
                onClick={() => onSelect(member.id)}
                aria-pressed={selected === member.id}
                className={chipClass(selected === member.id)}
            >
                {member.displayName}
            </button>
        ))}
    </div>
);
