import { useId, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { MAX_TAGS_PER_TODO, MAX_TAG_LENGTH, cleanTagNames } from "@shared/todos";
import { Badge } from "@/components/shadcn/badge";
import {
    Command,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/shadcn/command";
import { Label } from "@/components/shadcn/label";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/shadcn/popover";
import { Button } from "@/components/ui/Button";

export interface TagPickerProps {
    /** Every tag the household is using. */
    tags: string[];
    value: string[];
    onChange: (tags: string[]) => void;
}

/** Pick from the tags in use, or type a new one. Modal for the same reason as
 *  `Combobox`: the wheel can't scroll it inside a dialog otherwise. */
export const TagPicker = ({ tags, value, onChange }: TagPickerProps) => {
    const id = useId();
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");

    const typed = cleanTagNames([search])[0] ?? "";
    const has = (list: string[], name: string) =>
        list.some((tag) => tag.toLowerCase() === name.toLowerCase());
    const isNew = typed !== "" && !has([...tags, ...value], typed);
    const atLimit = value.length >= MAX_TAGS_PER_TODO;

    const toggle = (name: string) => {
        const picked = has(value, name);
        if (!picked && atLimit) return;

        onChange(
            picked
                ? value.filter((tag) => tag.toLowerCase() !== name.toLowerCase())
                : [...value, name]
        );
        setSearch("");
    };

    return (
        <div>
            <Label
                htmlFor={id}
                className="mb-1.5 text-sm font-medium text-text-secondary"
            >
                Tags
            </Label>
            <Popover modal open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        id={id}
                        role="combobox"
                        aria-expanded={open}
                        className="h-9 w-full justify-between border-border-strong bg-bg px-3 text-base font-normal text-text shadow-none hover:bg-bg"
                    >
                        <span className="truncate text-text-faint">
                            {tags.length > 0 ? "Pick or add a tag" : "Add a tag"}
                        </span>
                        <ChevronsUpDown className="text-text-faint" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    align="start"
                    collisionPadding={8}
                    className="hearth-ds w-(--radix-popover-trigger-width) min-w-56 p-0"
                >
                    <Command>
                        <CommandInput
                            placeholder="Find or add a tag"
                            value={search}
                            maxLength={MAX_TAG_LENGTH}
                            onValueChange={setSearch}
                        />
                        <CommandList>
                            {(tags.length > 0 || isNew) && (
                                <CommandGroup>
                                    {tags.map((tag) => (
                                        <CommandItem
                                            key={tag}
                                            value={tag}
                                            onSelect={() => toggle(tag)}
                                        >
                                            <span className="truncate">
                                                {tag}
                                            </span>
                                            {has(value, tag) && (
                                                <Check className="ml-auto" />
                                            )}
                                        </CommandItem>
                                    ))}
                                    {isNew && !atLimit && (
                                        <CommandItem
                                            value={typed}
                                            onSelect={() => toggle(typed)}
                                        >
                                            Add "{typed}"
                                        </CommandItem>
                                    )}
                                </CommandGroup>
                            )}
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
            {value.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1">
                    {value.map((tag) => (
                        <li key={tag}>
                            <Badge variant="secondary" className="gap-0.5 pr-0.5">
                                {tag}
                                <button
                                    type="button"
                                    aria-label={`Remove ${tag}`}
                                    className="rounded-full p-0.5 hover:bg-hover"
                                    onClick={() => toggle(tag)}
                                >
                                    <X className="size-3" />
                                </button>
                            </Badge>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
