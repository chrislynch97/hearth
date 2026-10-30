import { AuditLogSection } from "./AuditLogSection";
import { GeneralSection } from "./GeneralSection";
import { HouseholdAccessSection } from "./HouseholdAccessSection";
import { HouseholdDataSection } from "./HouseholdDataSection";
import { MembersSection } from "./MembersSection";

/** Settings for the active household, with edits gated by role — see issue #16. */
export const HouseholdSettingsPage = () => (
    <div className="flex flex-col gap-10">
        <GeneralSection />
        <MembersSection />
        <HouseholdAccessSection />
        <AuditLogSection />
        <HouseholdDataSection />
    </div>
);
