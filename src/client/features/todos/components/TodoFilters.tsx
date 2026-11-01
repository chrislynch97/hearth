import { useState } from "react";
import { FilterChip } from "@/components/ui/FilterChip";

export interface TodoFiltersProps {
    tags: string[];
    selectedTags: string[];
    onToggleTag: (tag: string) => void;
    members: Array<{ id: string; displayName: string }>;
    person: string | undefined;
    onPerson: (id: string | undefined) => void;
}

const HEADING = "text-sm font-medium text-text-secondary max-lg:sr-only";

/** Narrows what's on screen. All of it lives in the URL. Folded behind a button
 *  on a phone, where the chips would push the to-dos off the screen. */
export const TodoFilters = ({
    tags,
    selectedTags,
    onToggleTag,
    members,
    person,
    onPerson,
}: TodoFiltersProps) => {
    const activeCount = selectedTags.length + (person ? 1 : 0);
    const [open, setOpen] = useState(activeCount > 0);

    return (
        <div className="flex flex-col gap-1.5 lg:gap-3">
            <FilterChip
                active={activeCount > 0}
                aria-expanded={open}
                className="self-start lg:hidden"
                onClick={() => setOpen((shown) => !shown)}
            >
                {activeCount > 0 ? `Filter (${activeCount})` : "Filter"}
            </FilterChip>
            <div
                role="group"
                aria-labelledby="todo-filter-who"
                className={`flex flex-col gap-1.5 ${open ? "" : "max-lg:hidden"}`}
            >
                <h2 id="todo-filter-who" className={HEADING}>
                    Who
                </h2>
                <div className="flex flex-wrap gap-1.5">
                    {members.map((member) => (
                        <FilterChip
                            key={member.id}
                            active={person === member.id}
                            onClick={() =>
                                onPerson(
                                    person === member.id ? undefined : member.id
                                )
                            }
                        >
                            {member.displayName}
                        </FilterChip>
                    ))}
                </div>
            </div>
            {tags.length > 0 && (
                <div
                    role="group"
                    aria-labelledby="todo-filter-tags"
                    className={`flex flex-col gap-1.5 ${open ? "" : "max-lg:hidden"}`}
                >
                    <h2 id="todo-filter-tags" className={HEADING}>
                        Tags
                    </h2>
                    <div className="flex flex-wrap gap-1.5">
                        {tags.map((tag) => (
                            <FilterChip
                                key={tag}
                                active={selectedTags.includes(tag)}
                                onClick={() => onToggleTag(tag)}
                            >
                                {tag}
                            </FilterChip>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
