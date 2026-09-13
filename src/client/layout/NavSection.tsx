import { Collapse, Group, Text, UnstyledButton } from "@mantine/core";
import { hearthTokens } from "@/theme";
import { NavGroup } from "@/layout/NavGroup";
import type { NavSectionConfig } from "@/layout/nav-config";

export interface NavSectionProps {
    section: NavSectionConfig;
    opened: boolean;
    onToggle: () => void;
}

export const NavSection = ({ section, opened, onToggle }: NavSectionProps) => {
    const groups = section.groups.map((group, i) => (
        <NavGroup key={group.title ?? `group-${i}`} group={group} index={i} />
    ));

    // The section-less block at the top (Overview) is items and nothing else —
    // no header to click, so nothing to collapse.
    if (!section.title) return <div style={{ marginBottom: 4 }}>{groups}</div>;

    return (
        <div style={{ marginBottom: 6 }}>
            <UnstyledButton
                onClick={onToggle}
                aria-expanded={opened}
                px="sm"
                py={6}
                w="100%"
                style={{ borderRadius: 8 }}
            >
                <Group justify="space-between" gap={6} wrap="nowrap">
                    <Text
                        size="xs"
                        fw={700}
                        tt="uppercase"
                        ff="monospace"
                        style={{
                            color: hearthTokens.brand.linen,
                            opacity: 0.75,
                            letterSpacing: "0.08em",
                        }}
                    >
                        {section.title}
                    </Text>
                    <svg
                        width={14}
                        height={14}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{
                            color: hearthTokens.brand.linen,
                            opacity: 0.6,
                            transform: opened ? "rotate(90deg)" : "none",
                            transition: "transform 150ms ease",
                        }}
                    >
                        <path d="m9 6 6 6-6 6" />
                    </svg>
                </Group>
            </UnstyledButton>
            <Collapse expanded={opened}>{groups}</Collapse>
        </div>
    );
};
