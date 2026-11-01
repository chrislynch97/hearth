import { Download } from "lucide-react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { isIos, isStandalone } from "@/lib/pushSubscription";
import { Button } from "@/components/ui/Button";
import { SettingsRow } from "@/components/ui/SettingsRow";

/** Installing Hearth: a button where the browser offers one, the how-to on iOS,
 *  where it never does, and nothing once it's installed. */
export const InstallRow = () => {
    const { available, install } = useInstallPrompt();

    if (isStandalone()) return null;

    if (isIos()) {
        return (
            <SettingsRow
                title="Install Hearth"
                description="In Safari, tap Share, then Add to Home Screen."
            />
        );
    }

    if (!available) return null;

    return (
        <SettingsRow
            inline
            title="Install Hearth"
            description="Open it from your home screen, like any other app."
        >
            <Button
                variant="outline"
                icon={<Download size={15} strokeWidth={1.75} />}
                onClick={() => void install()}
            >
                Install
            </Button>
        </SettingsRow>
    );
};
