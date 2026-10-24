import { useFormatDate } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { PlusIcon } from "@/components/ui/PlusIcon";
import { SelectField } from "@/components/ui/SelectField";
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
    const current = occasions.filter(
        (occasion) => occasion.archivedAt === null
    );
    const archived = occasions.filter(
        (occasion) => occasion.archivedAt !== null
    );
    const options = [
        ...current.map(option),
        ...(archived.length > 0
            ? [{ label: "Archived", options: archived.map(option) }]
            : []),
    ];

    return (
        <div className="flex flex-wrap items-end gap-2">
            <SelectField
                label="Occasion"
                description={
                    selected.date ? formatDate(selected.date) : undefined
                }
                options={options}
                value={selected.id}
                onChange={(event) => onSelect(event.target.value)}
                className="min-w-48 flex-1 sm:flex-none"
            />
            <Button variant="ghost" onClick={onEdit}>
                Edit
            </Button>
            <span className="flex-1" />
            <Button icon={<PlusIcon />} onClick={onAdd}>
                New occasion
            </Button>
        </div>
    );
};
