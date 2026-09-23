import { Button } from "@/components/ui/Button";
import { PlusIcon } from "@/components/ui/PlusIcon";

export interface EmptyPlanProps {
    onAddCategory: () => void;
    onAddPot: () => void;
}

/** A new household has no categories, so no pane to hold a "New pot" button.
 *  A pot doesn't need a category, so it shouldn't have to wait for one. */
export const EmptyPlan = ({ onAddCategory, onAddPot }: EmptyPlanProps) => (
    <section className="rounded-md border border-dashed border-border-strong bg-sunken px-4 py-6">
        <h2 className="font-display text-h3 font-medium leading-tight">
            Nothing planned yet
        </h2>
        <p className="mt-1.5 text-sm text-text-muted">
            Start with a category to group things under, or add a pot now and
            file it later.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button icon={<PlusIcon />} onClick={onAddCategory}>
                New category
            </Button>
            <Button variant="dashed" icon={<PlusIcon />} onClick={onAddPot}>
                New pot
            </Button>
        </div>
    </section>
);
