import { useId, type ReactNode } from "react";
import { Card } from "@/components/shadcn/card";

export interface VehicleSectionProps {
    title: string;
    icon: ReactNode;
    /** A figure beside the title: a total, a count. */
    figure?: ReactNode;
    /** The add button, top right; full width under the title on a phone. */
    action?: ReactNode;
    children: ReactNode;
}

/** One part of a vehicle's page: dates, costs or bills, in a card. */
export const VehicleSection = ({
    title,
    icon,
    figure,
    action,
    children,
}: VehicleSectionProps) => {
    const headingId = useId();

    return (
        <section aria-labelledby={headingId} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                <h2
                    id={headingId}
                    className="flex items-center gap-2.5 font-display text-h3 font-medium text-text"
                >
                    <span
                        aria-hidden
                        className="flex size-7 items-center justify-center rounded-sm bg-primary-tint text-primary [&_svg]:size-4"
                    >
                        {icon}
                    </span>
                    {title}
                    {figure && (
                        <span className="tabular font-sans text-base font-normal text-text-muted">
                            {figure}
                        </span>
                    )}
                </h2>
                {action && <div className="max-sm:w-full">{action}</div>}
            </div>
            <Card className="gap-0 px-1.5 py-1.5">{children}</Card>
        </section>
    );
};
