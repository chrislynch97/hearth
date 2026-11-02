import { Button } from "@/components/ui/Button";

export interface WishHeroProps {
    title: string;
    summary: string;
    /** What's left to buy, formatted. Absent when nothing has a price. */
    total: string | undefined;
    /** Absent on All, which can't be edited. */
    onEdit?: () => void;
}

/** The name of what's on screen, and what it would cost. */
export const WishHero = ({ title, summary, total, onEdit }: WishHeroProps) => (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
            <div className="min-w-0">
                <h1 className="font-display text-display font-medium leading-tight break-words text-text">
                    {title}
                </h1>
                <p className="mt-1 text-md text-text-muted">{summary}</p>
            </div>
            {onEdit && (
                <Button
                    variant="ghost"
                    className="h-9 shrink-0"
                    onClick={onEdit}
                >
                    Edit list
                </Button>
            )}
        </div>
        {total && (
            <p className="flex shrink-0 items-baseline gap-2 sm:flex-col sm:items-end sm:gap-0">
                <span className="font-display tabular text-h1 font-medium text-text">
                    {total}
                </span>
                <span className="text-sm text-text-muted">left to buy</span>
            </p>
        )}
    </header>
);
