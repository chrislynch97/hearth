import { useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<unknown>;
}

const listeners = new Set<() => void>();

let installEvent: BeforeInstallPromptEvent | null = null;

const setInstallEvent = (next: BeforeInstallPromptEvent | null) => {
    installEvent = next;
    listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);

    return () => listeners.delete(listener);
};

// Chrome fires this once, early, so main.tsx imports this file to catch it long
// before anyone opens Settings.
window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    setInstallEvent(event as BeforeInstallPromptEvent);
});
window.addEventListener("appinstalled", () => setInstallEvent(null));

/** Chrome's install prompt, when it's on offer. A prompt only works once. */
export const useInstallPrompt = () => {
    const available = useSyncExternalStore(
        subscribe,
        () => installEvent !== null
    );

    const install = async () => {
        await installEvent?.prompt();
        setInstallEvent(null);
    };

    return { available, install };
};
