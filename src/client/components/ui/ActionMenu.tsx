import { MoreHorizontal } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { Button } from "@/components/ui/Button";

export interface ActionMenuItem {
    label: string;
    onSelect: () => void;
    /** Drawn in the danger colour, for a delete. */
    danger?: boolean;
}

export interface ActionMenuProps {
    /** Names the button for assistive tech, e.g. "Actions for Wedding". */
    label: string;
    items: ActionMenuItem[];
}

/** A "⋯" button that opens a short list of actions on one thing. The actions
 *  that would clutter a form (archive, delete) live here instead. */
export const ActionMenu = ({ label, items }: ActionMenuProps) => (
    <DropdownMenu>
        <DropdownMenuTrigger asChild>
            <Button
                variant="ghost"
                className="size-9 shrink-0 px-0 sm:size-8"
                aria-label={label}
                icon={<MoreHorizontal />}
            />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="hearth-ds min-w-36">
            {items.map((item) => (
                <DropdownMenuItem
                    key={item.label}
                    variant={item.danger ? "destructive" : "default"}
                    className="text-base"
                    onSelect={item.onSelect}
                >
                    {item.label}
                </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
    </DropdownMenu>
);
