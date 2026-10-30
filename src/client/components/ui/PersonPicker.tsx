import { SegmentedControl } from "@/components/ui/SegmentedControl";

export interface PersonPickerProps {
    /** Says whose records it switches between, e.g. "Whose raises". */
    label: string;
    persons: Array<{ id: string; displayName: string }>;
    value: string;
    onChange: (id: string) => void;
}

/** Switches a page between one person's records and another's. Spans the width
 *  on a phone, and has nothing to do with only one person to show. */
export const PersonPicker = ({
    label,
    persons,
    value,
    onChange,
}: PersonPickerProps) =>
    persons.length > 1 ? (
        <SegmentedControl
            label={label}
            options={persons.map((p) => ({
                value: p.id,
                label: p.displayName,
            }))}
            value={value}
            onChange={onChange}
            className="w-full sm:w-fit [&>*]:flex-1"
        />
    ) : null;
