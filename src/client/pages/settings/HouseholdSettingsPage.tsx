import { Stack } from "@mantine/core";
import { AuditLogSection } from "@/pages/AuditLogSection";
import { GeneralSection } from "./GeneralSection";
import { MembersSection } from "./MembersSection";
import { HouseholdAccessSection } from "./HouseholdAccessSection";
import { HouseholdDataSection } from "./HouseholdDataSection";

/** Settings for the active household, with edits gated by role — see issue #16. */
export const HouseholdSettingsPage = () => (
    <Stack gap="lg">
        <GeneralSection />
        <MembersSection />
        <HouseholdAccessSection />
        <HouseholdDataSection />
        <AuditLogSection />
    </Stack>
);
