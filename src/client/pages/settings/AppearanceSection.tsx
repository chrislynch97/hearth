import {
    Card,
    SegmentedControl,
    Stack,
    Text,
    Title,
    useMantineColorScheme,
} from "@mantine/core";

/** Appearance (Account scope). Light / Dark / System, wired straight to Mantine's
 *  color scheme — a per-browser preference it persists in localStorage, so no
 *  server or schema involvement. "System" maps to Mantine's "auto". */
export const AppearanceSection = () => {
    const { colorScheme, setColorScheme } = useMantineColorScheme();
    return (
        <Card withBorder padding="md" radius="md">
            <Title order={4} mb="sm">
                Appearance
            </Title>
            <Stack gap="xs">
                <Text size="sm" c="dimmed">
                    Choose how Hearth looks in this browser. System follows your
                    device’s light or dark setting.
                </Text>
                <SegmentedControl
                    value={colorScheme}
                    onChange={(v) =>
                        setColorScheme(v as "light" | "dark" | "auto")
                    }
                    aria-label="Appearance"
                    data={[
                        { value: "light", label: "Light" },
                        { value: "dark", label: "Dark" },
                        { value: "auto", label: "System" },
                    ]}
                />
            </Stack>
        </Card>
    );
};
