import type { ReactNode } from "react";
import { Card, Center, Group, Stack, Text } from "@mantine/core";
import { hearthTokens } from "@/theme";

export interface AuthCardProps {
    children: ReactNode;
    /** Card width; the wider screens carry a form, the narrow ones a message. */
    w?: number;
}

/** The centred, branded card every pre-auth screen sits in — login, invite
 *  acceptance, password reset, address verification. */
export const AuthCard = ({ children, w = 380 }: AuthCardProps) => (
    <Center h="100vh">
        <Card withBorder padding="xl" radius="lg" w={w}>
            <Stack gap="md">
                <Group gap={10} justify="center">
                    <svg width="28" height="28" viewBox="0 0 48 48" fill="none">
                        <polyline
                            points="8,25 24,10 40,25"
                            stroke={hearthTokens.brand.moss}
                            strokeWidth="3.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                        <path
                            d="M14 25 V40 H34 V25"
                            stroke={hearthTokens.brand.moss}
                            strokeWidth="3.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                        <circle
                            cx="24"
                            cy="32"
                            r="3.8"
                            fill={hearthTokens.brand.apricot}
                        />
                    </svg>
                    <Text
                        fw={500}
                        fz={22}
                        style={{
                            fontFamily: "var(--mantine-font-family-headings)",
                        }}
                    >
                        Hearth
                    </Text>
                </Group>
                {children}
            </Stack>
        </Card>
    </Center>
);
