import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { trpc } from "@/trpc";
import { notifySuccess } from "@/notify";
import { ArchiveAction } from "@/components/ui/ArchiveAction";
import { Button } from "@/components/ui/Button";
import { FormChoiceField } from "@/components/ui/FormChoiceField";
import { FormFooter } from "@/components/ui/FormFooter";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import {
    ReminderField,
    type DraftReminder,
} from "@/features/todos/components/ReminderField";
import { TagPicker } from "@/components/ui/TagPicker";
import {
    PRIORITY_OPTIONS,
    type TodoListSummary,
    type TodoWithDetails,
} from "@/features/todos/model";
import type { Priority } from "@shared/priority";

export interface TodoFormProps {
    todo: TodoWithDetails;
    lists: TodoListSummary[];
    members: Array<{ id: string; displayName: string }>;
    /** Every tag the household is using. */
    tags: string[];
    onDone: () => void;
}

interface TodoFormValues {
    title: string;
    notes: string;
    listId: string;
    assigneeId: string;
    dueDate: string;
    priority: Priority;
}

export const TodoForm = ({
    todo,
    lists,
    members,
    tags,
    onDone,
}: TodoFormProps) => {
    const utils = trpc.useUtils();
    const update = trpc.todos.update.useMutation();
    const archive = trpc.todos.archive.useMutation();
    const pushConfig = trpc.notifications.config.useQuery();

    const [pickedTags, setPickedTags] = useState(todo.tags);
    const [reminders, setReminders] = useState<DraftReminder[]>(
        todo.reminders.map((r) => ({
            at: r.remindAt,
            sent: r.sentAt !== null,
        }))
    );
    const {
        register,
        control,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<TodoFormValues>({
        defaultValues: {
            title: todo.title,
            notes: todo.notes ?? "",
            listId: todo.listId ?? "",
            assigneeId: todo.assigneeId ?? "",
            dueDate: todo.dueDate ?? "",
            priority: todo.priority as Priority,
        },
    });
    const dueDate = useWatch({ control, name: "dueDate" });

    const refresh = async () => {
        await Promise.all([
            utils.todos.invalidate(),
            utils.todoLists.invalidate(),
        ]);
    };

    const submit = handleSubmit(async (values) => {
        const title = values.title.trim();

        try {
            await update.mutateAsync({
                id: todo.id,
                expectedUpdatedAt: todo.updatedAt,
                title,
                notes: values.notes.trim() || null,
                listId: values.listId || null,
                assigneeId: values.assigneeId || null,
                dueDate: values.dueDate || null,
                priority: values.priority,
                tags: pickedTags,
                reminders: reminders.map((r) => r.at),
            });
        } catch {
            return; // surfaced by the global error handler; keep the form open
        }
        await refresh();
        notifySuccess(`Saved ${title}.`);
        onDone();
    });

    const handleArchive = async () => {
        try {
            await archive.mutateAsync({ id: todo.id });
        } catch {
            return;
        }
        await refresh();
        notifySuccess(`Deleted ${todo.title}.`);
        onDone();
    };

    const listOptions = lists
        .filter((list) => list.archivedAt === null || list.id === todo.listId)
        .map((list) => ({ value: list.id, label: list.name }));
    const memberOptions = members.map((member) => ({
        value: member.id,
        label: member.displayName,
    }));

    return (
        <form onSubmit={submit}>
            <div className="flex flex-col gap-3.5">
                <TextField
                    label="To-do"
                    placeholder="e.g. Book the florist"
                    error={errors.title?.message}
                    {...register("title", {
                        validate: (value) =>
                            value.trim().length > 0 ||
                            "Enter what needs doing.",
                    })}
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <FormChoiceField
                        control={control}
                        name="listId"
                        label="List"
                        emptyLabel="No list"
                        options={listOptions}
                    />
                    <FormChoiceField
                        control={control}
                        name="assigneeId"
                        label="Who"
                        emptyLabel="Anyone"
                        options={memberOptions}
                    />
                    <TextField
                        label="Deadline"
                        type="date"
                        {...register("dueDate")}
                    />
                    <FormChoiceField
                        control={control}
                        name="priority"
                        label="Priority"
                        options={PRIORITY_OPTIONS}
                    />
                </div>
                <TagPicker
                    tags={tags}
                    value={pickedTags}
                    onChange={setPickedTags}
                />
                {pushConfig.data?.enabled && (
                    <ReminderField
                        dueDate={dueDate}
                        value={reminders}
                        onChange={setReminders}
                    />
                )}
                <TextAreaField
                    label="Notes"
                    placeholder="Optional"
                    {...register("notes")}
                />
            </div>

            <FormFooter
                aside={
                    <ArchiveAction
                        label="Delete to-do"
                        consequence="Takes it off the list, along with its reminders."
                        pending={archive.isPending}
                        onArchive={() => void handleArchive()}
                    />
                }
            >
                <Button
                    variant="solid"
                    type="submit"
                    disabled={isSubmitting}
                    className="max-sm:h-9 max-sm:w-full"
                >
                    Save changes
                </Button>
            </FormFooter>
        </form>
    );
};
