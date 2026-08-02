import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { ComposeDriftAlert } from "./ComposeDriftAlert";

// The in-app half of #241. The whole point of the warning is that a compose file
// older than the image fails silently, so what's asserted is that it appears at
// all, names the settings, and gives the remedy rather than just the list.

const renderAlert = (settings: string[]) =>
    render(
        <MantineProvider>
            <ComposeDriftAlert settings={settings} />
        </MantineProvider>
    );

describe("ComposeDriftAlert", () => {
    it("renders nothing when the compose file passes everything through", () => {
        renderAlert([]);
        expect(
            screen.queryByText(/compose file is older than this version/i)
        ).toBeNull();
    });

    it("names the missing settings and the remedy", () => {
        renderAlert(["HEARTH_BACKUP_OFFSITE", "HEARTH_BACKUP_S3_BUCKET"]);
        expect(
            screen.getByText(/compose file is older than this version/i)
        ).toBeTruthy();
        expect(
            screen.getByText(/HEARTH_BACKUP_S3_BUCKET/, { exact: false })
        ).toBeTruthy();
        expect(screen.getByText(/Re-copy it/i)).toBeTruthy();
    });
});
