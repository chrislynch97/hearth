import { useState } from "react";
import { useForm } from "react-hook-form";
import { notifySuccess } from "@/notify";
import { ArchiveAction } from "@/components/ui/ArchiveAction";
import { Button } from "@/components/ui/Button";
import { FormFooter } from "@/components/ui/FormFooter";
import { TextField } from "@/components/ui/TextField";

export interface ListFormProps {
    /** Absent when adding. */
    list: { name: string; archivedAt: Date | null } | undefined;
    placeholder: string;
    /** What archiving does to what's on the list. */
    archiveConsequence: string;
    /** Adds or renames, resolving to a new list's slug. Throws to keep the form open. */
    save: (name: string) => Promise<string | undefined>;
    setArchived: (archived: boolean) => Promise<void>;
    onCreated: (slug: string) => void;
    onDone: () => void;
}

interface ListFormValues {
    name: string;
}

/** Names a list, and archives or restores it. Each feature brings its own calls. */
export const ListForm = ({
    list,
    placeholder,
    archiveConsequence,
    save,
    setArchived,
    onCreated,
    onDone,
}: ListFormProps) => {
    const [archiving, setArchiving] = useState(false);
    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<ListFormValues>({
        defaultValues: { name: list?.name ?? "" },
    });

    const submit = handleSubmit(async (values) => {
        const name = values.name.trim();
        let createdSlug: string | undefined;

        try {
            createdSlug = await save(name);
        } catch {
            return; // surfaced by the global error handler; keep the form open
        }
        notifySuccess(list ? `Saved ${name}.` : `Added ${name}.`);
        if (createdSlug) onCreated(createdSlug);
        onDone();
    });

    const archive = async (archived: boolean) => {
        if (!list) return;
        setArchiving(true);
        try {
            await setArchived(archived);
        } catch {
            return;
        } finally {
            setArchiving(false);
        }
        notifySuccess(
            archived ? `Archived ${list.name}.` : `Restored ${list.name}.`
        );
        onDone();
    };

    const archived = list?.archivedAt != null;

    return (
        <form onSubmit={submit}>
            <TextField
                label="Name"
                placeholder={placeholder}
                error={errors.name?.message}
                autoFocus
                {...register("name", {
                    validate: (value) =>
                        value.trim().length > 0 || "Give the list a name.",
                })}
            />

            <FormFooter
                aside={
                    list &&
                    (archived ? (
                        <Button
                            className="max-sm:h-9"
                            disabled={archiving}
                            onClick={() => void archive(false)}
                        >
                            Restore list
                        </Button>
                    ) : (
                        <ArchiveAction
                            label="Archive list"
                            consequence={archiveConsequence}
                            pending={archiving}
                            onArchive={() => void archive(true)}
                        />
                    ))
                }
            >
                <Button
                    variant="solid"
                    type="submit"
                    disabled={isSubmitting}
                    className="max-sm:h-9 max-sm:w-full"
                >
                    {list ? "Save changes" : "Add list"}
                </Button>
            </FormFooter>
        </form>
    );
};
