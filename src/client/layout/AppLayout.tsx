import { AppShell, Burger, Group } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "@tanstack/react-router";
import { hearthTokens } from "@/theme";
import "./nav.css";
import { NavPalette } from "@/layout/NavPalette";
import { Sidebar } from "@/layout/Sidebar";
import { closesMobileNav, sectionForPath } from "@/layout/nav-config";
import { HearthLink } from "@/layout/HearthLink";
import { UpdateBanner } from "@/layout/UpdateBanner";
import { AccountEmailBanner } from "@/layout/AccountEmailBanner";

export function AppLayout() {
    const location = useLocation();

    const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] =
        useDisclosure();
    const [paletteOpen, setPaletteOpen] = useState(false);
    const section = sectionForPath(location.pathname);

    // Not every navigation should shut the drawer — see closesMobileNav. The
    // first line matters under StrictMode: a re-run with the path already
    // recorded would compare it against itself and close on every route.
    const previousPath = useRef(location.pathname);
    useEffect(() => {
        if (previousPath.current === location.pathname) return;
        if (closesMobileNav(previousPath.current, location.pathname)) {
            closeMobile();
        }
        previousPath.current = location.pathname;
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
                // 72px rail, plus the 212px page list when a section owns the
                // route. Overview belongs to no section, so the list tier — and
                // its width — go with it.
                width: section ? 284 : 72,
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
                // The navbar is the design-system sidebar now: it paints its own
                // two surfaces and owns its borders, so the shell contributes
                // nothing but the box.
                navbar: {
                    backgroundColor: "transparent",
                    border: "none",
                    padding: 0,
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
                <Sidebar section={section} />
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
