export interface SpinnerProps {
    /** What is loading, for a screen reader. */
    label?: string;
}

export const Spinner = ({ label = "Loading" }: SpinnerProps) => (
    <div role="status" aria-label={label} className="flex justify-center py-10">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-border-strong border-t-primary" />
    </div>
);
