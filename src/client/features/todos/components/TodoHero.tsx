import { Progress } from "@microcharts/react/progress";
import { useElementWidth } from "@/useElementWidth";
import { Button } from "@/components/ui/Button";

export interface TodoHeroProps {
    title: string;
    summary: string;
    /** How far through a list is. Absent on All, which never finishes. */
    progress?: { done: number; total: number };
    /** Absent on All, which can't be edited. */
    onEdit?: () => void;
}

/** The name of what's on screen, and how it's going. */
export const TodoHero = ({
    title,
    summary,
    progress,
    onEdit,
}: TodoHeroProps) => {
    const { ref, width } = useElementWidth<HTMLDivElement>();

    return (
        <header className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
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
            {progress && progress.total > 0 && (
                <div ref={ref} className="flex items-center gap-3">
                    {width > 0 && (
                        <Progress
                            value={progress.done}
                            max={progress.total}
                            width={Math.max(0, width - 88)}
                            height={6}
                            className="block"
                        />
                    )}
                    <span className="tabular ml-auto text-sm whitespace-nowrap text-text-muted">
                        {progress.done} of {progress.total} done
                    </span>
                </div>
            )}
        </header>
    );
};
