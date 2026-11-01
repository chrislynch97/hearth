import { useState } from "react";
import { X } from "lucide-react";
import { MAX_REMINDERS_PER_TODO } from "@shared/todos";
import { Label } from "@/components/shadcn/label";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { reminderShortcuts } from "@/features/todos/model";

export interface DraftReminder {
    at: Date;
    /** Already gone out, so it stays as a record and can't be edited. */
    sent: boolean;
}

export interface ReminderFieldProps {
    /** Offers shortcuts relative to it once there is one. */
    dueDate: string;
    value: DraftReminder[];
    onChange: (reminders: DraftReminder[]) => void;
}

const WHEN = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
});

/** When to be nudged about a to-do: as many times as it takes. */
export const ReminderField = ({
    dueDate,
    value,
    onChange,
}: ReminderFieldProps) => {
    const [custom, setCustom] = useState("");
    const [error, setError] = useState<string | undefined>();

    const now = new Date();
    const atLimit = value.length >= MAX_REMINDERS_PER_TODO;
    const has = (at: Date) =>
        value.some((r) => r.at.getTime() === at.getTime());
    const shortcuts = dueDate
        ? reminderShortcuts(dueDate, now).filter(({ at }) => !has(at))
        : [];

    const add = (at: Date) => {
        onChange(
            [...value, { at, sent: false }].sort(
                (a, b) => a.at.getTime() - b.at.getTime()
            )
        );
    };

    const addCustom = () => {
        const at = new Date(custom);
        if (Number.isNaN(at.getTime()) || at <= now) {
            setError("Pick a time in the future.");
            return;
        }

        setError(undefined);
        setCustom("");
        if (!has(at)) add(at);
    };

    return (
        <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-text-secondary">
                Reminders
            </Label>
            {value.length > 0 && (
                <ul className="flex flex-col gap-1">
                    {value.map((reminder) => (
                        <li
                            key={reminder.at.getTime()}
                            className="flex items-center justify-between gap-2 text-base text-text"
                        >
                            <span>
                                {WHEN.format(reminder.at)}
                                {reminder.sent && (
                                    <span className="text-text-muted">
                                        {" "}
                                        · Sent
                                    </span>
                                )}
                            </span>
                            {!reminder.sent && (
                                <Button
                                    variant="ghost"
                                    className="size-9 shrink-0 px-0 sm:size-8"
                                    aria-label={`Remove reminder, ${WHEN.format(reminder.at)}`}
                                    icon={<X />}
                                    onClick={() =>
                                        onChange(
                                            value.filter((r) => r !== reminder)
                                        )
                                    }
                                />
                            )}
                        </li>
                    ))}
                </ul>
            )}
            {!atLimit && (
                <>
                    {shortcuts.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {shortcuts.map(({ label, at }) => (
                                <Button
                                    key={label}
                                    variant="dashed"
                                    compact
                                    className="max-sm:h-9 max-sm:w-full"
                                    onClick={() => add(at)}
                                >
                                    {label}
                                </Button>
                            ))}
                        </div>
                    )}
                    <div className="flex items-end gap-2">
                        <TextField
                            label="Remind me at"
                            hideLabel
                            type="datetime-local"
                            value={custom}
                            error={error}
                            className="min-w-0 flex-1"
                            onChange={(event) => setCustom(event.target.value)}
                        />
                        <Button
                            className="h-9 shrink-0"
                            disabled={!custom}
                            onClick={addCustom}
                        >
                            Add
                        </Button>
                    </div>
                </>
            )}
        </div>
    );
};
