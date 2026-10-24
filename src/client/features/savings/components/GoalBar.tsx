import { useFormatDate } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import { PlusIcon } from "@/components/ui/PlusIcon";
import { SelectField } from "@/components/ui/SelectField";
import type { GoalPlan } from "@/features/savings/model";

export interface GoalBarProps {
    goals: GoalPlan[];
    selected: GoalPlan;
    onSelect: (id: string) => void;
    onEdit: () => void;
    onRecordBalance: () => void;
    onAdd: () => void;
}

/** Which goal is on screen, with finished ones tucked under Archived. */
export const GoalBar = ({
    goals,
    selected,
    onSelect,
    onEdit,
    onRecordBalance,
    onAdd,
}: GoalBarProps) => {
    const formatDate = useFormatDate();

    const option = ({ goal }: GoalPlan) => ({
        value: goal.id,
        label: goal.name,
    });
    const live = goals.filter(({ goal }) => goal.archivedAt === null);
    const archived = goals.filter(({ goal }) => goal.archivedAt !== null);
    const options = [
        ...live.map(option),
        ...(archived.length > 0
            ? [{ label: "Archived", options: archived.map(option) }]
            : []),
    ];

    return (
        <div className="flex flex-wrap items-end gap-2">
            <SelectField
                label="Goal"
                description={`${formatDate(selected.goal.targetDate)} · ${selected.potName} pot`}
                options={options}
                value={selected.goal.id}
                onChange={(event) => onSelect(event.target.value)}
                className="min-w-48 flex-1 sm:flex-none"
            />
            <Button variant="ghost" onClick={onEdit}>
                Edit
            </Button>
            <span className="flex-1" />
            <Button variant="dashed" onClick={onRecordBalance}>
                Record balance
            </Button>
            <Button icon={<PlusIcon />} onClick={onAdd}>
                New goal
            </Button>
        </div>
    );
};
