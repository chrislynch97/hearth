import { Stack } from "@mantine/core";
import { AccountSection } from "./AccountSection";
import { AppearanceSection } from "./AppearanceSection";
import { SecuritySection } from "./SecuritySection";
import { MfaSection } from "./MfaSection";
import { SessionsSection } from "./SessionsSection";

/** Settings for the signed-in user (any role) — see issue #16. */
export const AccountSettingsPage = () => (
    <Stack gap="lg">
        <AccountSection />
        <AppearanceSection />
        <SecuritySection />
        <MfaSection />
        <SessionsSection />
    </Stack>
);
