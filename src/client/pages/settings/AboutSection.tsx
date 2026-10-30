import { trpc } from "@/trpc";
import { SettingsSection } from "@/components/ui/SettingsSection";
import { StatRow } from "@/components/ui/StatRow";

/** What this instance is running on, and how much is in it. */
export const AboutSection = () => {
    const statsQuery = trpc.data.stats.useQuery();

    const stats = statsQuery.data;
    if (!stats) return null;

    const entries = Object.entries(stats.counts).filter(([, n]) => n > 0);

    return (
        <SettingsSection
            title="About"
            description={`Database: ${stats.databaseLabel}`}
        >
            <div className="grid gap-x-10 gap-y-1.5 sm:grid-cols-2">
                {entries.map(([name, count]) => (
                    <StatRow key={name} label={name} value={count} />
                ))}
            </div>
        </SettingsSection>
    );
};
