import { Button } from "@/components/ui/Button";
import { PlusIcon } from "@/components/ui/PlusIcon";

export interface ListNavItem {
    id: string;
    name: string;
    slug: string;
    archivedAt: Date | null;
    total: number;
    done: number;
}

export interface ListNavProps {
    /** Names the landmark: "To-do lists". */
    label: string;
    /** The entry showing every list: "All to-dos". */
    allLabel: string;
    lists: ListNavItem[];
    /** Absent on All. */
    selected: ListNavItem | undefined;
    /** What's still open across every list. */
    openCount: number;
    onSelect: (slug: string | undefined) => void;
    onAdd: () => void;
}

interface EntryProps {
    label: string;
    count: number;
    active: boolean;
    muted?: boolean;
    onClick: () => void;
}

/** Pills on a phone, a column in the rail from `lg` up: the same element. */
const Entry = ({ label, count, active, muted, onClick }: EntryProps) => (
    <Button
        variant={active ? "solid" : "ghost"}
        aria-pressed={active}
        className={`h-9 justify-between gap-3 max-lg:rounded-full max-lg:border max-lg:border-border-strong lg:w-full ${muted && !active ? "text-text-muted" : ""}`}
        onClick={onClick}
    >
        <span className="truncate">{label}</span>
        <span className="tabular text-sm font-normal opacity-70">{count}</span>
    </Button>
);

/** Which list is on screen. Archived ones stay reachable, at the end. */
export const ListNav = ({
    label,
    allLabel,
    lists,
    selected,
    openCount,
    onSelect,
    onAdd,
}: ListNavProps) => (
    <nav aria-label={label} className="flex flex-wrap gap-1.5 lg:flex-col">
        <Entry
            label={allLabel}
            count={openCount}
            active={!selected}
            onClick={() => onSelect(undefined)}
        />
        {[...lists]
            .sort(
                (a, b) =>
                    Number(a.archivedAt !== null) -
                    Number(b.archivedAt !== null)
            )
            .map((list) => (
                <Entry
                    key={list.id}
                    label={list.name}
                    count={list.total - list.done}
                    active={selected?.id === list.id}
                    muted={list.archivedAt !== null}
                    onClick={() => onSelect(list.slug)}
                />
            ))}
        <Button
            variant="dashed"
            icon={<PlusIcon />}
            className="h-9 max-lg:rounded-full lg:w-full"
            onClick={onAdd}
        >
            New list
        </Button>
    </nav>
);
