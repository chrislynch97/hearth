/** Quick "go to…" palette opened with `/` (spec §7). Type to filter destinations,
 *  Enter jumps to the top match. */
import {useNavigate} from "@tanstack/react-router";
import {useState} from "react";
import {NAV_SECTIONS, type AppRoutePath} from "@/layout/nav-config";
import {Button, Modal, Stack, TextInput, Text} from "@mantine/core";

export interface NavPaletteProps {
    opened: boolean;
    onClose: () => void;
}

export const NavPalette = ({ opened, onClose }: NavPaletteProps) => {
    const navigate = useNavigate();

    const [query, setQuery] = useState('');

    const items = NAV_SECTIONS.flatMap((s) => s.items)
    const filtered = query
        ? items.filter((i) => i.label.toLowerCase().includes(query.toLowerCase()))
        : items

    function go(to: AppRoutePath) {
        setQuery('')
        onClose()
        navigate({ to })
    }

    return (
        <Modal opened={opened} onClose={onClose} title="Go to…" size="sm">
            <TextInput
                data-autofocus
                placeholder="Search pages…"
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && filtered[0]) {
                        e.preventDefault()
                        go(filtered[0].to)
                    }
                }}
                mb="sm"
            />
            <Stack gap={2}>
                {filtered.map((i) => (
                    <Button key={i.to} variant="subtle" color="gray" justify="flex-start" onClick={() => go(i.to)}>
                        {i.label}
                    </Button>
                ))}
                {filtered.length === 0 && (
                    <Text size="sm" c="dimmed">
                        No matching page.
                    </Text>
                )}
            </Stack>
        </Modal>
    )
};