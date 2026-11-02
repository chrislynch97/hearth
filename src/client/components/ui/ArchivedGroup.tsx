import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/shadcn/collapsible";
import { Button } from "@/components/ui/Button";

export interface ArchivedGroupProps {
    count: number;
    /** The archived items, as list items. */
    children: ReactNode;
}

/** Archived records, folded away until someone asks. */
export const ArchivedGroup = ({ count, children }: ArchivedGroupProps) => {
    const [open, setOpen] = useState(false);

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
                <Button
                    variant="ghost"
                    icon={
                        <ChevronRight
                            className={`transition-transform ${open ? "rotate-90" : ""}`}
                        />
                    }
                    className="h-9 px-2 text-md font-medium text-text-secondary"
                >
                    Archived ({count})
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <ul className="m-0 mt-1 flex list-none flex-col gap-2 p-0 opacity-80">
                    {children}
                </ul>
            </CollapsibleContent>
        </Collapsible>
    );
};
