import { useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Notice } from "@/components/ui/Notice";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import { trpc } from "@/trpc";

export interface FeedbackModalProps {
    opened: boolean;
    onClose: () => void;
}

type Kind = "bug" | "idea";

const KINDS: Array<{ value: Kind; label: string }> = [
    { value: "bug", label: "Bug" },
    { value: "idea", label: "Idea" },
];

export const FeedbackModal = ({ opened, onClose }: FeedbackModalProps) => {
    const config = trpc.feedback.config.useQuery();
    const me = trpc.users.me.useQuery();
    const submit = trpc.feedback.submit.useMutation({
        meta: { suppressErrorToast: true },
    });
    const route = useRouterState({ select: (s) => s.location.pathname });

    const [kind, setKind] = useState<Kind>("bug");
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [created, setCreated] = useState<{
        url: string;
        number: number;
    } | null>(null);
    const [error, setError] = useState("");

    const repo = config.data?.repo;
    const name = me.data?.displayName || me.data?.username || "your name";
    const canSubmit =
        title.trim().length >= 3 && description.trim().length >= 10;

    const reset = () => {
        setKind("bug");
        setTitle("");
        setDescription("");
        setCreated(null);
        setError("");
    };

    const handleClose = () => {
        onClose();
        // Clear after the dialog has animated out so nothing flashes on the way.
        setTimeout(reset, 200);
    };

    const handleSubmit = async () => {
        setError("");
        try {
            const result = await submit.mutateAsync({
                kind,
                title: title.trim(),
                description: description.trim(),
                route,
            });
            setCreated(result);
        } catch (e) {
            setError(
                e instanceof Error ? e.message : "Could not send your report."
            );
        }
    };

    return (
        <ConfirmDialog
            open={opened}
            onOpenChange={(next) => !next && handleClose()}
            title="Send feedback"
            confirm={
                created
                    ? undefined
                    : {
                          label: "Send",
                          onClick: () => void handleSubmit(),
                          pending: submit.isPending,
                          disabled: !canSubmit,
                      }
            }
        >
            {created ? (
                <Notice tone="positive" title="Thanks — your report was filed">
                    Issue #{created.number} was created.{" "}
                    <a
                        href={created.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-primary underline-offset-4 hover:underline"
                    >
                        View it on GitHub
                    </a>
                    .
                </Notice>
            ) : (
                <>
                    <SegmentedControl
                        label="Kind of feedback"
                        options={KINDS}
                        value={kind}
                        onChange={setKind}
                        className="w-full [&>*]:flex-1"
                    />
                    <TextField
                        label="Title"
                        placeholder={
                            kind === "bug"
                                ? "What went wrong?"
                                : "What's your idea?"
                        }
                        value={title}
                        onChange={(e) => setTitle(e.currentTarget.value)}
                        maxLength={160}
                        data-autofocus
                    />
                    <TextAreaField
                        label="Details"
                        description="What happened, what you expected, and how to reproduce it if it's a bug."
                        placeholder="The more detail, the easier it is to fix."
                        value={description}
                        onChange={(e) => setDescription(e.currentTarget.value)}
                        maxLength={4000}
                    />
                    <p className="text-sm text-text-muted">
                        Posted publicly to the{" "}
                        {repo ? (
                            <span className="font-semibold text-text-secondary">
                                {repo}
                            </span>
                        ) : (
                            "project"
                        )}{" "}
                        GitHub repo, along with your name ({name}), the page
                        you&apos;re on, and the app version. Don&apos;t include
                        anything private.
                    </p>
                    {error && (
                        <Notice tone="danger" title="Couldn't send">
                            {error}
                        </Notice>
                    )}
                </>
            )}
        </ConfirmDialog>
    );
};
