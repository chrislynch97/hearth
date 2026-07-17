import { Badge, NavLink, Text } from "@mantine/core";
import { hearthTokens } from "@/theme";
import { Link } from "react-router-dom";
import { NavIcon } from "@/layout/NavIcon";
import type { NavSectionConfig } from "@/layout/nav-config";
import { trpc } from "@/trpc";

export interface NavSectionProps {
    section: NavSectionConfig;
    index: number;
}

export const NavSection = ({ section, index }: NavSectionProps) => {
    const backlogQuery = trpc.reconcile.backlog.useQuery();

    const backlogCount = backlogQuery.data?.perPot?.length ?? 0;

    return (
        <div style={{ marginBottom: 4 }}>
            {section.title && (
                <Text
                    size="xs"
                    fw={700}
                    tt="uppercase"
                    px="sm"
                    mt={index === 0 ? 0 : 14}
                    mb={4}
                    ff="monospace"
                    style={{
                        color: hearthTokens.brand.linen,
                        opacity: 0.45,
                        letterSpacing: "0.06em",
                    }}
                >
                    {section.title}
                </Text>
            )}
            {section.items.map((item) => {
                // Exact match, or a sub-route of it (e.g. a /foo/bar page keeps
                // the /foo item active). The `+ '/'` stops '/' matching all.
                const isActive =
                    location.pathname === item.to ||
                    location.pathname.startsWith(item.to + "/");
                return (
                    <NavLink
                        key={item.to}
                        component={Link}
                        to={item.to}
                        label={item.label}
                        active={isActive}
                        variant="light"
                        className="hearth-navlink"
                        leftSection={<NavIcon name={item.icon} />}
                        style={{
                            borderRadius: 8,
                            marginBottom: 2,
                            backgroundColor: isActive
                                ? "rgba(239, 237, 227, 0.18)"
                                : undefined,
                        }}
                        styles={{
                            label: {
                                color: hearthTokens.brand.linen,
                                fontWeight: isActive ? 500 : 400,
                            },
                        }}
                        rightSection={
                            item.to === "/catchup" && backlogCount > 0 ? (
                                <Badge
                                    size="sm"
                                    color="apricot"
                                    variant="filled"
                                    circle
                                >
                                    {backlogCount}
                                </Badge>
                            ) : undefined
                        }
                    />
                );
            })}
        </div>
    );
};
