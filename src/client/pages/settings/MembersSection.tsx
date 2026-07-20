import { useState } from "react";
import {
    ActionIcon,
    Button,
    Card,
    Divider,
    Group,
    Select,
    Stack,
    Text,
    TextInput,
    Title,
} from "@mantine/core";
import { trpc } from "@/trpc";

export const MembersSection = () => {
    const utils = trpc.useUtils();
    const membersQuery = trpc.members.list.useQuery();
    const addPerson = trpc.members.addPerson.useMutation();
    const updateMember = trpc.members.update.useMutation();
    const archive = trpc.members.archive.useMutation();
    const linkUser = trpc.members.linkUser.useMutation();

    const me = trpc.users.me.useQuery();
    const isAdmin = me.data?.role === "admin" || me.data?.role === "owner";
    // Accounts to map members onto (admin-only endpoint).
    const accounts = trpc.access.list.useQuery(undefined, { enabled: isAdmin });

    const members = (membersQuery.data ?? []).filter(
        (m) => m.archivedAt === null
    );
    const [newName, setNewName] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");

    const accountOptions = [
        { value: "", label: "— no account —" },
        ...(accounts.data ?? []).map((a) => ({
            value: a.userId,
            label: `${a.displayName} (@${a.username})`,
        })),
    ];

    const refresh = async () => {
        await Promise.all([
            utils.members.list.invalidate(),
            utils.bootstrap.context.invalidate(),
            utils.users.me.invalidate(),
        ]);
    };

    const handleLink = async (memberId: string, userId: string) => {
        await linkUser.mutateAsync({ memberId, userId: userId || null });
        await refresh();
    };

    const handleAdd = async () => {
        if (!newName.trim()) return;
        await addPerson.mutateAsync({ displayName: newName.trim() });
        await refresh();
        setNewName("");
    };

    const handleRename = async (id: string) => {
        if (editName.trim()) {
            const target = members.find((m) => m.id === id);
            await updateMember.mutateAsync({
                id,
                expectedUpdatedAt: target?.updatedAt,
                displayName: editName.trim(),
            });
            await refresh();
        }
        setEditingId(null);
    };

    const cancelRename = () => {
        setEditingId(null);
        setEditName("");
    };

    return (
        <Card withBorder padding="md" radius="md">
            <Title order={4} mb="sm">
                Members
            </Title>
            <Stack gap={4}>
                {members.map((m) => (
                    <div key={m.id}>
                        <Group justify="space-between" px="xs" py={4}>
                            {editingId === m.id ? (
                                <Group gap="xs" style={{ flex: 1 }}>
                                    <TextInput
                                        size="xs"
                                        value={editName}
                                        onChange={(e) =>
                                            setEditName(e.currentTarget.value)
                                        }
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter")
                                                void handleRename(m.id);
                                            else if (e.key === "Escape")
                                                cancelRename();
                                        }}
                                        autoFocus
                                        style={{ flex: 1 }}
                                    />
                                    <Button
                                        size="xs"
                                        onClick={() => void handleRename(m.id)}
                                    >
                                        Save
                                    </Button>
                                    <Button
                                        size="xs"
                                        variant="default"
                                        onClick={cancelRename}
                                    >
                                        Cancel
                                    </Button>
                                </Group>
                            ) : (
                                <>
                                    <Text size="sm">
                                        {m.displayName}
                                        {m.kind === "joint" && (
                                            <Text span size="xs" c="dimmed">
                                                {" "}
                                                · joint
                                            </Text>
                                        )}
                                    </Text>
                                    <Group gap={4}>
                                        <ActionIcon
                                            variant="subtle"
                                            size="sm"
                                            aria-label={`Rename ${m.displayName}`}
                                            onClick={() => {
                                                setEditingId(m.id);
                                                setEditName(m.displayName);
                                            }}
                                        >
                                            ✎
                                        </ActionIcon>
                                        {m.kind !== "joint" && (
                                            <ActionIcon
                                                variant="subtle"
                                                color="red"
                                                size="sm"
                                                aria-label={`Archive ${m.displayName}`}
                                                onClick={async () => {
                                                    await archive.mutateAsync({
                                                        id: m.id,
                                                    });
                                                    await refresh();
                                                }}
                                            >
                                                ×
                                            </ActionIcon>
                                        )}
                                    </Group>
                                </>
                            )}
                        </Group>
                        {isAdmin &&
                            m.kind === "person" &&
                            editingId !== m.id && (
                                <Group gap="xs" px="xs" pb={6} wrap="nowrap">
                                    <Text
                                        size="xs"
                                        c="dimmed"
                                        w={58}
                                        style={{ flexShrink: 0 }}
                                    >
                                        Account
                                    </Text>
                                    <Select
                                        size="xs"
                                        data={accountOptions}
                                        value={m.userId ?? ""}
                                        allowDeselect={false}
                                        placeholder="— no account —"
                                        onChange={(v) =>
                                            void handleLink(m.id, v ?? "")
                                        }
                                        style={{ flex: 1, maxWidth: 260 }}
                                    />
                                </Group>
                            )}
                    </div>
                ))}
            </Stack>
            <Divider my="sm" />
            <Group align="flex-end">
                <TextInput
                    label="Add person"
                    placeholder="Name"
                    value={newName}
                    onChange={(e) => setNewName(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === "Enter" && void handleAdd()}
                    style={{ flex: 1 }}
                />
                <Button
                    onClick={() => void handleAdd()}
                    loading={addPerson.isPending}
                >
                    Add
                </Button>
            </Group>
        </Card>
    );
};
