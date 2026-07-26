import { Card, Text } from "@mantine/core";

export interface StatProps {
    label: string;
    value: string;
    sub?: string;
}

export const Stat = ({ label, value, sub }: StatProps) => (
    <Card withBorder padding="sm" radius="md">
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {label}
        </Text>
        <Text size="xl" fw={700}>
            {value}
        </Text>
        {sub && (
            <Text size="xs" c="dimmed">
                {sub}
            </Text>
        )}
    </Card>
);
