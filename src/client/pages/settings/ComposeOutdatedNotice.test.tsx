import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComposeOutdatedNotice } from "./ComposeOutdatedNotice";

// The in-app half of #241: shown only when the compose file predates the image,
// and it has to say what to do, not just that something is off.

describe("ComposeOutdatedNotice", () => {
    it("renders nothing when the compose file is current", () => {
        render(<ComposeOutdatedNotice outdated={false} />);
        expect(screen.queryByRole("note")).toBeNull();
    });

    it("says the file is older and gives the remedy", () => {
        render(<ComposeOutdatedNotice outdated />);
        expect(
            screen.getByText(/compose file is older than this version/i)
        ).toBeTruthy();
        expect(screen.getByText("compose.override.yml")).toBeTruthy();
        expect(
            screen.getByRole("link", { name: /how to update/i })
        ).toBeTruthy();
    });
});
