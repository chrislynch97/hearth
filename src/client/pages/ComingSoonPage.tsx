import { Badge, Card, Group, Stack, Text, Title } from "@mantine/core";
import { useLocation } from "@tanstack/react-router";
import { NavIcon } from "@/layout/NavIcon";
import { NAV_ITEMS } from "@/layout/nav-config";

/** The page behind every nav item still marked `planned`. There's one of these
 *  rather than a stub file per domain: it reads the same nav config the sidebar
 *  does, so a planned page can never describe itself differently from the item
 *  that links to it. */
export const ComingSoonPage = () => {
    const { pathname } = useLocation();

    const entry = NAV_ITEMS.find(({ item }) => item.to === pathname);

    if (!entry?.item.planned) {
        return (
            <Stack gap="xs">
                <Title order={2}>Not built yet</Title>
                <Text c="dimmed">
                    This page is planned but has nothing to show.
                </Text>
            </Stack>
        );
    }

    const { item, section, group } = entry;
    const trail = [section.title, group.title].filter(Boolean).join(" → ");

    return (
        <Stack gap="md" maw={560}>
            <Stack gap={4}>
                {trail && (
                    <Text size="xs" c="dimmed" tt="uppercase" ff="monospace">
                        {trail}
                    </Text>
                )}
                <Group gap="sm">
                    <Title order={2}>{item.label}</Title>
                    <Badge color="gray" variant="outline">
                        Soon
                    </Badge>
                </Group>
            </Stack>

            <Card withBorder padding="lg" radius="md">
                <Group align="flex-start" gap="md" wrap="nowrap">
                    <NavIcon name={item.icon} color="currentColor" size={22} />
                    <Text>{item.planned}</Text>
                </Group>
            </Card>

            <Text size="sm" c="dimmed">
                Nothing here works yet — the page exists so the idea has
                somewhere to live until it does.
            </Text>
        </Stack>
    );
};
