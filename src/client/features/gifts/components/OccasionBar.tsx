import { useFormatDate } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { PlusIcon } from "@/components/ui/PlusIcon";
import type { OccasionSummary } from "@/features/gifts/model";

export interface OccasionBarProps {
    occasions: OccasionSummary[];
    selected: OccasionSummary;
    onSelect: (id: string) => void;
    onEdit: () => void;
    onAdd: () => void;
}

/** Which occasion is on screen, with the past ones tucked under Archived. */
export const OccasionBar = ({
    occasions,
    selected,
    onSelect,
    onEdit,
    onAdd,
}: OccasionBarProps) => {
    const formatDate = useFormatDate();

    const option = (occasion: OccasionSummary) => ({
        value: occasion.id,
        label: occasion.name,
    });
    const groups = [
        {
            group: "Current",
            items: occasions.filter((o) => o.archivedAt === null).map(option),
        },
        {
            group: "Archived",
            items: occasions.filter((o) => o.archivedAt !== null).map(option),
        },
    ].filter((group) => group.items.length > 0);

    return (
        <div className="flex flex-wrap items-end gap-2">
            <Combobox
                label="Occasion"
                description={
                    selected.date ? formatDate(selected.date) : undefined
                }
                placeholder="Pick an occasion"
                options={groups}
                value={selected.id}
                onChange={(id) => id && onSelect(id)}
                className="w-full sm:w-64"
            />
            <Button
                variant="ghost"
                className="h-9 max-sm:flex-1"
                onClick={onEdit}
            >
                Edit
            </Button>
            <span className="hidden flex-1 sm:block" />
            <Button
                icon={<PlusIcon />}
                className="h-9 max-sm:flex-1"
                onClick={onAdd}
            >
                New occasion
            </Button>
        </div>
    );
};
