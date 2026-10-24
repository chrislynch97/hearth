import type { ReactNode } from "react";

export interface FundingCardProps {
    title: string;
    /** One line on what the figures mean, under the title. */
    subtitle?: string;
    /** The card's headline figure, already formatted, right of the title. */
    figure?: ReactNode;
    /** Omitted when the headline figure says it all. */
    children?: ReactNode;
}

/** The shell every Funding card shares: title and headline figure on one line,
 *  so the number to act on is the first thing read. */
export const FundingCard = ({
    title,
    subtitle,
    figure,
    children,
}: FundingCardProps) => (
    <section className="rounded-md border border-border bg-raised">
        <div
            className={[
                "px-4 py-3",
                children ? "border-b border-border" : "",
            ].join(" ")}
        >
            <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-lg font-medium">{title}</h2>
                {figure}
            </div>
            {subtitle && (
                <p className="mt-1 text-xs leading-snug text-text-muted">
                    {subtitle}
                </p>
            )}
        </div>
        {children && <div className="px-4 py-3">{children}</div>}
    </section>
);
