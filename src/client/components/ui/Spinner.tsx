import { Spinner as ShadcnSpinner } from "@/components/shadcn/spinner";

export interface SpinnerProps {
    /** What is loading, for a screen reader. */
    label?: string;
}

/** shadcn's spinner, centred in the space a section's content will fill. */
export const Spinner = ({ label = "Loading" }: SpinnerProps) => (
    <div className="flex justify-center py-10">
        <ShadcnSpinner aria-label={label} className="size-5 text-primary" />
    </div>
);
