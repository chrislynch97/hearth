import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/shadcn/collapsible";
import { Button } from "@/components/ui/Button";

export interface TodoDoneProps {
    count: number;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    clearing: boolean;
    onClear: () => void;
    /** The rows. */
    children: ReactNode;
}

/** Finished to-dos, folded away under the diary until someone asks. */
export const TodoDone = ({
    count,
    open,
    onOpenChange,
    clearing,
    onClear,
    children,
}: TodoDoneProps) => (
    <Collapsible open={open} onOpenChange={onOpenChange}>
        <div className="flex items-center justify-between gap-2">
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
                    Done ({count})
                </Button>
            </CollapsibleTrigger>
            {open && (
                <Button
                    variant="ghost"
                    className="h-9"
                    disabled={clearing}
                    onClick={onClear}
                >
                    Clear done
                </Button>
            )}
        </div>
        <CollapsibleContent>
            <ul className="mt-1 flex flex-col">{children}</ul>
        </CollapsibleContent>
    </Collapsible>
);
