import { Link } from "@tanstack/react-router";
import { Group, Text } from "@mantine/core";
import { HearthMark } from "@/components/HearthMark";
import { hearthTokens } from "@/theme";

export const HearthLink = () => {
    return (
        <Link to="/" style={{ textDecoration: "none" }}>
            <Group gap={8} align="center" style={{ cursor: "pointer" }}>
                <HearthMark />
                <Text
                    size="xl"
                    fw={500}
                    lh={1}
                    style={{
                        fontFamily: "var(--mantine-font-family-headings)",
                        color: hearthTokens.brand.linen,
                    }}
                >
                    Hearth
                </Text>
            </Group>
        </Link>
    );
};
