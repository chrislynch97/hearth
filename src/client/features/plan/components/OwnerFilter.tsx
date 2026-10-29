import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/shadcn/select";
import { ALL } from "@/features/plan/model";
import type { Member } from "../../../../server/db/schema";

export interface OwnerFilterProps {
    members: Member[];
    /** `ALL` or a member id. */
    selected: string;
    onSelect: (value: string) => void;
}

/** Narrows the plan to one owner's pots and the main-account bills paid from
 *  their account. */
export const OwnerFilter = ({
    members,
    selected,
    onSelect,
}: OwnerFilterProps) => (
    <Select value={selected} onValueChange={onSelect}>
        <SelectTrigger
            aria-label="Whose accounts"
            className="w-full bg-raised text-base sm:w-[180px]"
        >
            <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" className="hearth-ds">
            <SelectItem value={ALL} className="text-base">
                Everyone
            </SelectItem>
            {members.map((member) => (
                <SelectItem
                    key={member.id}
                    value={member.id}
                    className="text-base"
                >
                    {member.displayName}
                </SelectItem>
            ))}
        </SelectContent>
    </Select>
);
