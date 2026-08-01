import { Group, Kbd, Modal, Stack, Text } from "@mantine/core"

const rows: [string, string][] = [
    ["/", "Go to page…"],
    ["g then d", "Go to Overview"],
    ["g then p / o / b", "Pots / Outgoings / Bill review"],
    ["g then f / u", "Funding / Upcoming"],
    ["g then s / c", "Spending / Catch-up"],
    ["g then i / w / r", "Income / Net worth / Reports"],
    ["?", "Show this help"],
]

export interface ShortcutsHelpProps {
    opened: boolean
    onClose: () => void
}

export const ShortcutsHelp = ({ opened, onClose }: ShortcutsHelpProps) => {
    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title="Keyboard shortcuts"
            size="sm"
        >
            <Stack gap="xs">
                {rows.map(([keys, desc]) => (
                    <Group key={keys} justify="space-between">
                        <Text size="sm">{desc}</Text>
                        <Group gap={4}>
                            {keys.split(" ").map((k, i) =>
                                k === "then" ? (
                                    <Text key={i} size="xs" c="dimmed">
                                        then
                                    </Text>
                                ) : (
                                    <Kbd key={i}>{k}</Kbd>
                                )
                            )}
                        </Group>
                    </Group>
                ))}
            </Stack>
        </Modal>
    )
}
