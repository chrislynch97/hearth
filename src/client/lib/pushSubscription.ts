export type PushAvailability =
    | "ready"
    | "blocked"
    | "needs-install"
    | "unsupported";

export interface PushSubscriptionKeys {
    endpoint: string;
    keys: { p256dh: string; auth: string };
}

export const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

// iPadOS reports itself as a Mac, so touch is what gives it away.
export const isIos = () =>
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/** What this browser can do right now. iOS only exposes push to an app opened
 *  from the Home Screen, so that's checked before the feature detection. */
export const pushAvailability = (): PushAvailability => {
    if (isIos() && !isStandalone()) return "needs-install";

    const supported =
        window.isSecureContext &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;

    if (!supported) return "unsupported";

    return Notification.permission === "denied" ? "blocked" : "ready";
};

export const base64UrlToBytes = (value: string) => {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");

    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
};

// `getRegistration`, not `ready`: `ready` never settles if no worker was registered.
export const currentSubscription = async () => {
    if (!("serviceWorker" in navigator)) return null;

    const registration = await navigator.serviceWorker.getRegistration();

    return (await registration?.pushManager.getSubscription()) ?? null;
};

/** Ask permission and subscribe this browser. Null if permission was refused.
 *  The worker is registered only here, so nobody who hasn't opted in gets one. */
export const subscribeThisDevice = async (
    publicKey: string
): Promise<PushSubscriptionKeys | null> => {
    if ((await Notification.requestPermission()) !== "granted") return null;

    await navigator.serviceWorker.register("/sw.js");
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(publicKey),
    });
    const { endpoint, keys } = subscription.toJSON();

    return {
        endpoint: endpoint ?? subscription.endpoint,
        keys: { p256dh: keys?.p256dh ?? "", auth: keys?.auth ?? "" },
    };
};

/** Opt this browser out. Never throws, because signing out calls it and must
 *  still happen when this fails. */
export const forgetThisDevice = async (
    removeFromServer: (endpoint: string) => Promise<unknown>
) => {
    try {
        const subscription = await currentSubscription();

        if (!subscription) return;

        await subscription.unsubscribe();
        await removeFromServer(subscription.endpoint);
    } catch {
        // A row left behind is removed the first time the push service rejects it.
    }
};
