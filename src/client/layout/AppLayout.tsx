import { AppShell, Burger, Group } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { hearthTokens } from "@/theme";
import "./nav.css";
import { GO_TO, NAV_SECTIONS } from "./nav-config";
import { NavPalette } from "@/layout/NavPalette";
import { ShortcutsHelp } from "@/layout/ShortcutsHelp";
import { UserMenu } from "@/layout/UserMenu";
import { NavSection } from "@/layout/NavSection";
import { ThemeToggle } from "@/layout/ThemeToggle";
import { HearthLink } from "@/layout/HearthLink";

export function AppLayout() {
    const location = useLocation();
    const navigate = useNavigate();

    const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] =
        useDisclosure();
    const [helpOpen, setHelpOpen] = useState(false);
    const [paletteOpen, setPaletteOpen] = useState(false);

    useEffect(() => {
        closeMobile();
    }, [location.pathname]);

    // Global keyboard shortcuts
    useEffect(() => {
        let gPending = false;
        let gTimer: ReturnType<typeof setTimeout> | undefined;

        function onKey(e: KeyboardEvent) {
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
            if (gPending) {
                gPending = false;
                const to = GO_TO[e.key.toLowerCase()];
                if (to) {
                    e.preventDefault();
                    navigate(to);
                }
                return;
            }
            if (e.key === "?") {
                setHelpOpen(true);
            } else if (e.key === "/") {
                e.preventDefault();
                setPaletteOpen(true);
            } else if (e.key === "[" || e.key === "]") {
                // Prev/next budget period — period-aware pages listen for this.
                e.preventDefault();
                window.dispatchEvent(
                    new CustomEvent("hearth:period", {
                        detail: e.key === "[" ? -1 : 1,
                    })
                );
            } else if (e.key === "g") {
                gPending = true;
                gTimer = setTimeout(() => {
                    gPending = false;
                }, 1200);
            }
        }

        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("keydown", onKey);
            if (gTimer) clearTimeout(gTimer);
        };
    }, [navigate]);

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
                    {NAV_SECTIONS.map((section, i) => (
                        <NavSection
                            key={section.title ?? `group-${i}`}
                            section={section}
                            index={i}
                        />
                    ))}
                </AppShell.Section>

                <AppShell.Section
                    p={"sm"}
                    style={{ borderTop: "1px solid rgba(239, 237, 227, 0.14)" }}
                >
                    <Group gap={8} justify={"center"}>
                        <UserMenu />
                        <ThemeToggle />
                    </Group>
                </AppShell.Section>
            </AppShell.Navbar>

            <AppShell.Main>
                <Outlet />
            </AppShell.Main>

            <ShortcutsHelp
                opened={helpOpen}
                onClose={() => setHelpOpen(false)}
            />
            <NavPalette
                opened={paletteOpen}
                onClose={() => setPaletteOpen(false)}
            />
        </AppShell>
    );
}
