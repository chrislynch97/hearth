import { useColorScheme } from "@/hooks/useColorScheme";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SettingsRow } from "@/components/ui/SettingsRow";
import { SettingsSection } from "@/components/ui/SettingsSection";

/** Appearance (Account scope): a per-browser preference, persisted locally, so
 *  no server or schema involvement. The top bar's sun/moon sets the same one. */
export const AppearanceSection = () => {
    const { setting, set } = useColorScheme();

    return (
        <SettingsSection
            title="Appearance"
            description="How Hearth looks in this browser."
        >
            <SettingsRow
                title="Theme"
                description="System follows your device’s light or dark setting."
            >
                <SegmentedControl
                    label="Appearance"
                    value={setting}
                    onChange={set}
                    options={[
                        { value: "light", label: "Light" },
                        { value: "dark", label: "Dark" },
                        { value: "auto", label: "System" },
                    ]}
                />
            </SettingsRow>
        </SettingsSection>
    );
};
