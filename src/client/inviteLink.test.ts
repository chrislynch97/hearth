import { describe, expect, it } from "vitest";
import { inviteLink, readInviteToken } from "@/inviteLink";

const TOKEN = "a".repeat(64);

const loc = (pathname: string, hash = "") => ({ pathname, hash });

describe("inviteLink", () => {
    it("puts the token in the fragment, never the path", () => {
        const link = inviteLink("https://hearth.example", TOKEN);
        expect(link).toBe(`https://hearth.example/invite#${TOKEN}`);
        expect(new URL(link).pathname).toBe("/invite");
    });
});

describe("readInviteToken", () => {
    it("reads a token from the fragment", () => {
        expect(readInviteToken(loc("/invite", `#${TOKEN}`))).toBe(TOKEN);
    });

    it("reads a token from a legacy path segment", () => {
        expect(readInviteToken(loc(`/invite/${TOKEN}`))).toBe(TOKEN);
    });

    it("percent-decodes the token", () => {
        expect(readInviteToken(loc("/invite", "#a%2Bb"))).toBe("a+b");
    });

    it("survives a malformed escape instead of throwing", () => {
        expect(readInviteToken(loc("/invite", "#a%zz"))).toBe("a%zz");
    });

    it("returns an empty token for an invite URL with none", () => {
        expect(readInviteToken(loc("/invite"))).toBe("");
        expect(readInviteToken(loc("/invite/"))).toBe("");
    });

    it("returns null for any other URL", () => {
        expect(readInviteToken(loc("/"))).toBeNull();
        expect(readInviteToken(loc("/settings", `#${TOKEN}`))).toBeNull();
        expect(readInviteToken(loc("/invitepending"))).toBeNull();
    });

    it("round-trips a built link", () => {
        const { pathname, hash } = new URL(
            inviteLink("https://hearth.example", TOKEN)
        );
        expect(readInviteToken({ pathname, hash })).toBe(TOKEN);
    });
});
