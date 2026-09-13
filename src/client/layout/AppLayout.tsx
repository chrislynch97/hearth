import { AppShell, Burger, Group } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { Outlet, useLocation } from "@tanstack/react-router";
import { hearthTokens } from "@/theme";
import "./nav.css";
import { NAV_SECTIONS } from "./nav-config";
import { NavPalette } from "@/layout/NavPalette";
import { UserMenu } from "@/layout/UserMenu";
import { NavSection } from "@/layout/NavSection";
import { useOpenNavSection } from "@/layout/useOpenNavSection";
import { HearthLink } from "@/layout/HearthLink";
import { UpdateBanner } from "@/layout/UpdateBanner";
import { AccountEmailBanner } from "@/layout/AccountEmailBanner";

export function AppLayout() {
    const location = useLocation();

    const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] =
        useDisclosure();
    const [paletteOpen, setPaletteOpen] = useState(false);
    const { openSection, toggleSection } = useOpenNavSection(location.pathname);

    useEffect(() => {
        closeMobile();
    }, [location.pathname, closeMobile]);

    // `/` opens the go-to palette. The `g`-prefixed jump shortcuts were removed
    // with the nav restructure (#12) — unused, and a flat letter per page stopped
    // scaling once the sidebar grew past one domain.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            const el = document.activeElement as HTMLElement | null;
            if (
                el &&
                (el.tagName === "INPUT" ||
                    el.tagName === "TEXTAREA" ||
                    el.tagName === "SELECT" ||
                    el.isContentEditable)
            ) {
                return;
            }
            if (e.key === "/") {
                e.preventDefault();
                setPaletteOpen(true);
            }
        };

        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    return (
        <AppShell
            header={{ height: { base: 52, sm: 0 } }}
            navbar={{
                width: 300,
                breakpoint: "sm",
                collapsed: { mobile: !mobileOpened },
            }}
            padding="xl"
            styles={{
                header: {
                    backgroundColor:
                        "light-dark(var(--mantine-color-moss-6), var(--mantine-color-dark-7))",
                    borderBottom: "none",
                },
                navbar: {
                    backgroundColor:
                        "light-dark(var(--mantine-color-moss-6), var(--mantine-color-dark-7))",
                },
                main: {
                    backgroundColor:
                        "light-dark(var(--mantine-color-sand-1), var(--mantine-color-dark-8))",
                },
            }}
        >
            <AppShell.Header hiddenFrom="sm">
                <Group h="100%" px="md" gap={10}>
                    <Burger
                        opened={mobileOpened}
                        onClick={toggleMobile}
                        size="sm"
                        color={hearthTokens.brand.linen}
                        aria-label="Toggle navigation"
                    />
                    <HearthLink />
                </Group>
            </AppShell.Header>

            <AppShell.Navbar>
                <AppShell.Section
                    visibleFrom="sm"
                    px="md"
                    pt="md"
                    pb="sm"
                    style={{
                        borderBottom: "1px solid rgba(239, 237, 227, 0.14)",
                    }}
                >
                    <HearthLink />
                </AppShell.Section>

                <AppShell.Section
                    grow
                    px="xs"
                    pt="sm"
                    style={{ overflowY: "auto", overscrollBehavior: "contain" }}
                >
                    {NAV_SECTIONS.map((section) => (
                        <NavSection
                            key={section.id}
                            section={section}
                            opened={openSection === section.id}
                            onToggle={() => toggleSection(section.id)}
                        />
                    ))}
                </AppShell.Section>

                <AppShell.Section
                    p={"sm"}
                    style={{ borderTop: "1px solid rgba(239, 237, 227, 0.14)" }}
                >
                    <Group gap={8} justify={"center"}>
                        <UserMenu />
                    </Group>
                </AppShell.Section>
            </AppShell.Navbar>

            <AppShell.Main>
                <UpdateBanner />
                <AccountEmailBanner />
                <Outlet />
            </AppShell.Main>

            <NavPalette
                opened={paletteOpen}
                onClose={() => setPaletteOpen(false)}
            />
        </AppShell>
    );
}
