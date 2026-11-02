import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/shadcn/collapsible";
import { Button } from "@/components/ui/Button";

export interface WishBoughtProps {
    count: number;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The cards. */
    children: ReactNode;
}

/** Bought things, folded away under the list until someone asks. */
export const WishBought = ({
    count,
    open,
    onOpenChange,
    children,
}: WishBoughtProps) => (
    <Collapsible open={open} onOpenChange={onOpenChange}>
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
                Bought ({count})
            </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
            <ul className="mt-1 grid grid-cols-1 sm:grid-cols-2 sm:gap-2.5">
                {children}
            </ul>
        </CollapsibleContent>
    </Collapsible>
);
