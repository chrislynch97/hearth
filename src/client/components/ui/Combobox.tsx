import { useId, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import {
    Command,
    CommandEmpty,
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

export interface ComboboxOption {
    value: string;
    label: string;
}

export interface ComboboxGroup {
    /** The heading over its options, e.g. whose pots these are. */
    group: string;
    items: ComboboxOption[];
}

export interface ComboboxProps {
    label: string;
    description?: string;
    options: Array<ComboboxOption | ComboboxGroup>;
    value: string | null;
    /** Null when the clear option is picked. */
    onChange: (value: string | null) => void;
    /** Shown on the button with nothing picked. */
    placeholder: string;
    /** Adds a first option that picks nothing, e.g. "All pots". */
    clearLabel?: string;
    disabled?: boolean;
    /** Keeps the label for assistive tech only, where the row says what it's for. */
    hideLabel?: boolean;
    className?: string;
}

const isGroup = (
    option: ComboboxOption | ComboboxGroup
): option is ComboboxGroup => "group" in option;

/** A pick-one with a search box, for lists too long to scroll: shadcn's Popover
 *  and Command. Modal, or the wheel can't scroll it inside a dialog. */
export const Combobox = ({
    label,
    description,
    options,
    value,
    onChange,
    placeholder,
    clearLabel,
    disabled,
    hideLabel = false,
    className = "",
}: ComboboxProps) => {
    const id = useId();
    const [open, setOpen] = useState(false);

    const groups: ComboboxGroup[] = options.some(isGroup)
        ? options.filter(isGroup)
        : [
              {
                  group: "",
                  items: options.filter(
                      (o): o is ComboboxOption => !isGroup(o)
                  ),
              },
          ];
    const selected = groups
        .flatMap((g) => g.items)
        .find((item) => item.value === value);

    const pick = (next: string | null) => {
        onChange(next);
        setOpen(false);
    };

    return (
        <div className={className}>
            <Label
                htmlFor={id}
                className={
                    hideLabel
                        ? "sr-only"
                        : "mb-1.5 text-sm font-medium text-text-secondary"
                }
            >
                {label}
            </Label>
            {description && (
                <p className="mb-1.5 text-sm text-text-muted">{description}</p>
            )}
            <Popover modal open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        id={id}
                        role="combobox"
                        aria-expanded={open}
                        disabled={disabled}
                        className="h-9 w-full justify-between border-border-strong bg-bg px-3 text-base font-normal text-text shadow-none hover:bg-bg"
                    >
                        <span
                            className={`truncate ${selected ? "" : "text-text-faint"}`}
                        >
                            {selected?.label ?? placeholder}
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
                        <CommandInput placeholder="Search" />
                        <CommandList>
                            <CommandEmpty>Nothing matches that.</CommandEmpty>
                            {clearLabel && (
                                <CommandGroup>
                                    <CommandItem onSelect={() => pick(null)}>
                                        {clearLabel}
                                    </CommandItem>
                                </CommandGroup>
                            )}
                            {groups.map(({ group, items }) => (
                                <CommandGroup key={group} heading={group}>
                                    {items.map((item) => (
                                        <CommandItem
                                            key={item.value}
                                            value={`${group} ${item.label}`}
                                            onSelect={() => pick(item.value)}
                                        >
                                            <span className="truncate">
                                                {item.label}
                                            </span>
                                            {item.value === value && (
                                                <Check className="ml-auto" />
                                            )}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            ))}
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    );
};
