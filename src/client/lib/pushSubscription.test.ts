import { afterEach, describe, expect, it, vi } from "vitest";
import {
    base64UrlToBytes,
    forgetThisDevice,
    pushAvailability,
    turnOffThisDevice,
} from "./pushSubscription";

const stubUserAgent = (userAgent: string) =>
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);

const stubRegistration = (subscription: unknown) =>
    vi.stubGlobal("navigator", {
        userAgent: navigator.userAgent,
        maxTouchPoints: 0,
        serviceWorker: {
            getRegistration: async () => ({
                pushManager: { getSubscription: async () => subscription },
            }),
        },
    });

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("base64UrlToBytes", () => {
    it("decodes url-safe base64 without padding", () => {
        expect([...base64UrlToBytes("-_8")]).toEqual([251, 255]);
    });
});

describe("pushAvailability", () => {
    it("sends an iPhone in a browser tab to the Home Screen first", () => {
        stubUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");

        expect(pushAvailability()).toBe("needs-install");
    });

    it("says so when the browser has no push", () => {
        stubUserAgent("Mozilla/5.0 (X11; Linux x86_64)");

        expect(pushAvailability()).toBe("unsupported");
    });
});

describe("turnOffThisDevice", () => {
    it("removes the device from the server, then the browser", async () => {
        const calls: string[] = [];
        stubRegistration({
            endpoint: "https://push.example/1",
            unsubscribe: async () => calls.push("browser"),
        });

        await turnOffThisDevice(async () => calls.push("server"));

        expect(calls).toEqual(["server", "browser"]);
    });

    it("throws when the browser rejects", async () => {
        stubRegistration({
            endpoint: "https://push.example/1",
            unsubscribe: async () => {
                throw new Error("offline");
            },
        });

        await expect(turnOffThisDevice(vi.fn())).rejects.toThrow("Try again");
    });

    it("throws when the browser refuses", async () => {
        stubRegistration({
            endpoint: "https://push.example/1",
            unsubscribe: async () => false,
        });

        await expect(turnOffThisDevice(vi.fn())).rejects.toThrow("Try again");
    });

    it("leaves the browser subscribed when the server fails", async () => {
        const unsubscribe = vi.fn();
        stubRegistration({ endpoint: "https://push.example/1", unsubscribe });

        await expect(
            turnOffThisDevice(vi.fn().mockRejectedValue(new Error("offline")))
        ).rejects.toThrow("offline");
        expect(unsubscribe).not.toHaveBeenCalled();
    });
});

describe("forgetThisDevice", () => {
    it("unsubscribes the browser and tells the server", async () => {
        const unsubscribe = vi.fn().mockResolvedValue(true);
        const removeFromServer = vi.fn().mockResolvedValue(undefined);
        stubRegistration({ endpoint: "https://push.example/1", unsubscribe });

        await forgetThisDevice(removeFromServer);

        expect(unsubscribe).toHaveBeenCalled();
        expect(removeFromServer).toHaveBeenCalledWith("https://push.example/1");
    });

    it("does nothing on a device that never opted in", async () => {
        const removeFromServer = vi.fn();
        stubRegistration(null);

        await forgetThisDevice(removeFromServer);

        expect(removeFromServer).not.toHaveBeenCalled();
    });

    it("never throws, so signing out still happens", async () => {
        stubRegistration({
            endpoint: "https://push.example/1",
            unsubscribe: vi.fn().mockRejectedValue(new Error("offline")),
        });

        await expect(forgetThisDevice(vi.fn())).resolves.toBeUndefined();
    });
});
