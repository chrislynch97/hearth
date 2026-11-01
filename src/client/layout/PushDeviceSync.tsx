import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import { currentSubscription, subscriptionKeys } from "@/lib/pushSubscription";

/** Keeps the server in step with this browser's push subscription, which it can
 *  lose or get wrong (a second login, a rotated endpoint, a restore), and takes
 *  notification taps from the service worker. Renders nothing. */
export const PushDeviceSync = () => {
    const router = useRouter();
    const { mutate } = trpc.notifications.subscribe.useMutation({
        meta: { suppressErrorToast: true },
    });

    useEffect(() => {
        void currentSubscription()
            .then((subscription) => {
                if (subscription) mutate(subscriptionKeys(subscription));
            })
            .catch(() => undefined);
    }, [mutate]);

    useEffect(() => {
        if (!("serviceWorker" in navigator)) return;

        const openFromTap = ({ data }: MessageEvent) => {
            if (data?.type === "hearth:open") router.history.push(data.url);
        };

        navigator.serviceWorker.addEventListener("message", openFromTap);

        return () =>
            navigator.serviceWorker.removeEventListener("message", openFromTap);
    }, [router]);

    return null;
};
