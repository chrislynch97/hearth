import { useEffect, useState } from "react";
import { trpc } from "@/trpc";
import {
    currentSubscription,
    forgetThisDevice,
    pushAvailability,
    subscribeThisDevice,
} from "@/lib/pushSubscription";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { SettingsRow } from "@/components/ui/SettingsRow";
import { SettingsSection } from "@/components/ui/SettingsSection";
import { InstallRow } from "./InstallRow";

const TITLE = "Notifications on this device";

const INLINE_ERRORS = { meta: { suppressErrorToast: true } };

const UNAVAILABLE = {
    "needs-install":
        "Add Hearth to your Home Screen and open it from there first. iPhones only allow notifications for installed apps.",
    unsupported: "This browser can’t show notifications.",
    blocked:
        "Notifications are blocked. Allow them for Hearth in your browser or phone settings.",
};

/** Installing Hearth and opting this device in to notifications. Per browser, so
 *  each person's phone is its own choice. */
export const NotificationsSection = () => {
    const config = trpc.notifications.config.useQuery();
    const subscribe = trpc.notifications.subscribe.useMutation(INLINE_ERRORS);
    const unsubscribe =
        trpc.notifications.unsubscribe.useMutation(INLINE_ERRORS);
    const sendTest = trpc.notifications.sendTest.useMutation(INLINE_ERRORS);

    const [availability, setAvailability] = useState(pushAvailability);
    const [endpoint, setEndpoint] = useState<string | null>(null);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    useEffect(() => {
        void currentSubscription()
            .then((subscription) => setEndpoint(subscription?.endpoint ?? null))
            .catch(() => setEndpoint(null));
    }, []);

    const run = async (action: () => Promise<void>) => {
        setError("");
        setMessage("");
        setWorking(true);
        try {
            await action();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Something went wrong.");
        } finally {
            setWorking(false);
        }
    };

    const turnOn = () =>
        run(async () => {
            const subscription = await subscribeThisDevice(
                config.data?.publicKey ?? ""
            );

            if (!subscription) {
                setAvailability(pushAvailability());
                return;
            }

            await subscribe.mutateAsync(subscription);
            setEndpoint(subscription.endpoint);
        });

    const turnOff = () =>
        run(async () => {
            await forgetThisDevice((value) =>
                unsubscribe.mutateAsync({ endpoint: value })
            );
            setEndpoint(null);
        });

    const test = () =>
        run(async () => {
            const { sent } = await sendTest.mutateAsync();

            if (sent === 0) {
                setError(
                    "Couldn’t reach this device. Turn notifications off and on again."
                );
                return;
            }

            setMessage("Sent. It should appear in a few seconds.");
        });

    if (!config.data) return null;

    return (
        <SettingsSection
            title="Notifications"
            description="Get notifications from Hearth on this device."
        >
            <div className="flex flex-col gap-6">
                <InstallRow />
                {!config.data.enabled ? (
                    <SettingsRow
                        title={TITLE}
                        description="Notifications aren’t set up on this server."
                    />
                ) : availability !== "ready" ? (
                    <SettingsRow
                        title={TITLE}
                        description={UNAVAILABLE[availability]}
                    />
                ) : endpoint ? (
                    <SettingsRow title={TITLE} description="On.">
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <Button
                                variant="outline"
                                className="w-full sm:w-auto"
                                disabled={working}
                                onClick={() => void test()}
                            >
                                Send a test
                            </Button>
                            <Button
                                variant="outline"
                                className="w-full sm:w-auto"
                                disabled={working}
                                onClick={() => void turnOff()}
                            >
                                Turn off
                            </Button>
                        </div>
                    </SettingsRow>
                ) : (
                    <SettingsRow title={TITLE} description="Off.">
                        <Button
                            className="w-full sm:w-auto"
                            disabled={working}
                            onClick={() => void turnOn()}
                        >
                            Turn on
                        </Button>
                    </SettingsRow>
                )}
                {error && <Notice tone="danger" title={error} />}
                {message && <Notice tone="positive" title={message} />}
            </div>
        </SettingsSection>
    );
};
