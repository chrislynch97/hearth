import { useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
    Alert,
    Anchor,
    Button,
    Group,
    Modal,
    SegmentedControl,
    Stack,
    Text,
    Textarea,
    TextInput,
} from "@mantine/core";
import { trpc } from "@/trpc";

export interface FeedbackModalProps {
    opened: boolean;
    onClose: () => void;
}

type Kind = "bug" | "idea";

export const FeedbackModal = ({ opened, onClose }: FeedbackModalProps) => {
    const config = trpc.feedback.config.useQuery();
    const me = trpc.users.me.useQuery();
    const submit = trpc.feedback.submit.useMutation();
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
        // Clear after the modal has animated out so nothing flashes on the way.
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
        <Modal
            opened={opened}
            onClose={handleClose}
            title="Send feedback"
            size="lg"
        >
            {created ? (
                <Stack gap="md">
                    <Alert
                        color="moss"
                        variant="light"
                        title="Thanks — your report was filed"
                    >
                        Issue #{created.number} was created.{" "}
                        <Anchor
                            href={created.url}
                            target="_blank"
                            rel="noreferrer"
                        >
                            View it on GitHub
                        </Anchor>
                        .
                    </Alert>
                    <Group justify="flex-end">
                        <Button onClick={handleClose}>Done</Button>
                    </Group>
                </Stack>
            ) : (
                <Stack gap="sm">
                    <SegmentedControl
                        value={kind}
                        onChange={(v) => setKind(v as Kind)}
                        data={[
                            { value: "bug", label: "Bug" },
                            { value: "idea", label: "Idea" },
                        ]}
                    />
                    <TextInput
                        label="Title"
                        placeholder={
                            kind === "bug"
                                ? "What went wrong?"
                                : "What's your idea?"
                        }
                        value={title}
                        onChange={(e) => setTitle(e.currentTarget.value)}
                        maxLength={160}
                        autoFocus
                    />
                    <Textarea
                        label="Details"
                        description="What happened, what you expected, and how to reproduce it if it's a bug."
                        placeholder="The more detail, the easier it is to fix."
                        value={description}
                        onChange={(e) => setDescription(e.currentTarget.value)}
                        minRows={5}
                        maxLength={4000}
                        autosize
                    />
                    <Text size="xs" c="dimmed">
                        Posted publicly to the{" "}
                        {repo ? (
                            <Text span ff="monospace" fz="xs">
                                {repo}
                            </Text>
                        ) : (
                            "project"
                        )}{" "}
                        GitHub repo, along with your name ({name}), the page
                        you&apos;re on, and the app version. Don&apos;t include
                        anything private.
                    </Text>
                    {error && (
                        <Alert color="red" title="Couldn't send">
                            {error}
                        </Alert>
                    )}
                    <Group justify="flex-end">
                        <Button variant="default" onClick={handleClose}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => void handleSubmit()}
                            loading={submit.isPending}
                            disabled={!canSubmit}
                        >
                            Send
                        </Button>
                    </Group>
                </Stack>
            )}
        </Modal>
    );
};
