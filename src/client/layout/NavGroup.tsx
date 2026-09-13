import { Badge, NavLink, Text } from "@mantine/core";
import { hearthTokens } from "@/theme";
import { Link, useLocation } from "@tanstack/react-router";
import { NavIcon } from "@/layout/NavIcon";
import type { NavGroupConfig } from "@/layout/nav-config";
import { trpc } from "@/trpc";

export interface NavGroupProps {
    group: NavGroupConfig;
    index: number;
}

export const NavGroup = ({ group, index }: NavGroupProps) => {
    const { pathname } = useLocation();
    const backlogQuery = trpc.reconcile.backlog.useQuery();

    const backlogCount = backlogQuery.data?.perPot?.length ?? 0;

    return (
        <div style={{ marginBottom: 4 }}>
            {group.title && (
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
                    {group.title}
                </Text>
            )}
            {group.items.map((item) => {
                // Exact match, or a sub-route of it (e.g. a /foo/bar page keeps
                // the /foo item active). The `+ '/'` stops '/' matching all.
                const isActive =
                    pathname === item.to || pathname.startsWith(item.to + "/");
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
                            // Dim a domain that isn't built yet, so the eye skips
                            // it while scanning a section it can actually use.
                            opacity: item.planned && !isActive ? 0.55 : 1,
                        }}
                        styles={{
                            label: {
                                color: hearthTokens.brand.linen,
                                fontWeight: isActive ? 500 : 400,
                            },
                        }}
                        rightSection={
                            item.planned ? (
                                <Badge
                                    size="xs"
                                    color="gray"
                                    variant="outline"
                                    styles={{
                                        root: {
                                            color: hearthTokens.brand.linen,
                                            borderColor:
                                                "rgba(239, 237, 227, 0.35)",
                                        },
                                    }}
                                >
                                    Soon
                                </Badge>
                            ) : item.to === "/catchup" && backlogCount > 0 ? (
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
