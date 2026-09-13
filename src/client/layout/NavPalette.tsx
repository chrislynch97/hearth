/** Quick "go to…" palette opened with `/` (spec §7). Type to filter destinations,
 *  Enter jumps to the top match. */
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { NAV_ITEMS, type AppRoutePath } from "@/layout/nav-config";
import {
    Badge,
    Button,
    Group,
    Modal,
    Stack,
    Text,
    TextInput,
} from "@mantine/core";

export interface NavPaletteProps {
    opened: boolean;
    onClose: () => void;
}

export const NavPalette = ({ opened, onClose }: NavPaletteProps) => {
    const navigate = useNavigate();

    const [query, setQuery] = useState("");

    const needle = query.trim().toLowerCase();
    // Match the trail as well as the label, so "money" lists the whole section
    // and "upkeep" lists the group — with 28 destinations, remembering which
    // section something lives in is easier than remembering its exact name.
    const filtered = needle
        ? NAV_ITEMS.filter(({ item, section, group }) =>
              [item.label, section.title, group.title]
                  .filter(Boolean)
                  .some((s) => s!.toLowerCase().includes(needle))
          )
        : NAV_ITEMS;

    const go = (to: AppRoutePath) => {
        setQuery("");
        onClose();
        navigate({ to });
    };

    return (
        <Modal opened={opened} onClose={onClose} title="Go to…" size="sm">
            <TextInput
                data-autofocus
                placeholder="Search pages…"
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && filtered[0]) {
                        e.preventDefault();
                        go(filtered[0].item.to);
                    }
                }}
                mb="sm"
            />
            <Stack gap={2}>
                {filtered.map(({ item, section, group }) => {
                    const trail = [section.title, group.title]
                        .filter(Boolean)
                        .join(" → ");
                    return (
                        <Button
                            key={item.to}
                            variant="subtle"
                            color="gray"
                            justify="flex-start"
                            onClick={() => go(item.to)}
                            styles={{ label: { flex: 1 } }}
                        >
                            <Group gap="xs" justify="space-between" w="100%">
                                <span>
                                    {trail && (
                                        <Text
                                            span
                                            size="xs"
                                            c="dimmed"
                                            mr={6}
                                            ff="monospace"
                                        >
                                            {trail} →
                                        </Text>
                                    )}
                                    {item.label}
                                </span>
                                {item.planned && (
                                    <Badge
                                        size="xs"
                                        color="gray"
                                        variant="outline"
                                    >
                                        Soon
                                    </Badge>
                                )}
                            </Group>
                        </Button>
                    );
                })}
                {filtered.length === 0 && (
                    <Text size="sm" c="dimmed">
                        No matching page.
                    </Text>
                )}
            </Stack>
        </Modal>
    );
};
