import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface PeriodStepperProps {
    /** The range on show, already formatted. */
    label: string;
    onPrevious: () => void;
    onNext: () => void;
    /** Hides the way back, and stops the arrow running into the future. */
    isCurrent: boolean;
    onCurrent: () => void;
}

/** Steps through budget periods one at a time, with a way back to this one.
 *  Spans the width on a phone, the arrows out at the thumbs. */
export const PeriodStepper = ({
    label,
    onPrevious,
    onNext,
    isCurrent,
    onCurrent,
}: PeriodStepperProps) => (
    <div className="flex w-full flex-col items-center gap-x-3 gap-y-1 sm:w-auto sm:flex-row">
        <div className="flex w-full items-center gap-1 sm:w-auto">
            <Button
                variant="ghost"
                className="size-9 px-0 sm:size-8"
                aria-label="Previous period"
                icon={<ChevronLeft />}
                onClick={onPrevious}
            />
            <span className="tabular flex-1 text-center text-base font-medium text-text">
                {label}
            </span>
            <Button
                variant="ghost"
                className="size-9 px-0 sm:size-8"
                aria-label="Next period"
                icon={<ChevronRight />}
                disabled={isCurrent}
                onClick={onNext}
            />
        </div>
        {!isCurrent && (
            <Button variant="link" className="text-sm" onClick={onCurrent}>
                This period
            </Button>
        )}
    </div>
);
