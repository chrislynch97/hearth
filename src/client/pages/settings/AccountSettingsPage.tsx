import { AccountSection } from "./AccountSection";
import { AppearanceSection } from "./AppearanceSection";
import { DeleteAccountSection } from "./DeleteAccountSection";
import { MfaSection } from "./MfaSection";
import { SecuritySection } from "./SecuritySection";
import { SessionsSection } from "./SessionsSection";

/** Settings for the signed-in user (any role) — see issue #16. */
export const AccountSettingsPage = () => (
    <div className="flex flex-col gap-10">
        <AccountSection />
        <AppearanceSection />
        <SecuritySection />
        <MfaSection />
        <SessionsSection />
        <DeleteAccountSection />
    </div>
);
