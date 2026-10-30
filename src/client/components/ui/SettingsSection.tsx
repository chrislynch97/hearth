import { useId, type ReactNode } from "react";
import { Card, CardContent } from "@/components/shadcn/card";

export interface SettingsSectionProps {
    title: string;
    /** What this group of settings is for, in a sentence or two. */
    description?: ReactNode;
    /** `danger` edges the card red: the irreversible things go here. */
    tone?: "default" | "danger";
    children: ReactNode;
}

/** One group of settings: title and explanation down the left on a wide
 *  screen, the controls in a card beside them. Stacked on a phone. */
export const SettingsSection = ({
    title,
    description,
    tone = "default",
    children,
}: SettingsSectionProps) => {
    const headingId = useId();

    return (
        <section
            aria-labelledby={headingId}
            className="grid gap-3 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:gap-10"
        >
            <div className="lg:pt-5">
                <h2
                    id={headingId}
                    className={`font-display text-h3 font-medium leading-tight ${tone === "danger" ? "text-danger" : "text-text"}`}
                >
                    {title}
                </h2>
                {description && (
                    <p className="mt-1 text-base text-text-muted">
                        {description}
                    </p>
                )}
            </div>
            <Card className={tone === "danger" ? "border-danger/40" : ""}>
                <CardContent className="flex flex-col gap-5">
                    {children}
                </CardContent>
            </Card>
        </section>
    );
};
