import type { ReactNode } from "react";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from "@/components/shadcn/card";
import { StatFigure } from "@/components/ui/StatFigure";

export interface FundingAccountCardProps {
    title: string;
    /** Says what the headline figure is, e.g. "By standing order". */
    figureLabel: string;
    figure: string;
    /** e.g. "each month", so the rows needn't all repeat a unit. */
    hint?: string;
    children?: ReactNode;
}

/** One account's plan: the number to set up, then what that number is made of. */
export const FundingAccountCard = ({
    title,
    figureLabel,
    figure,
    hint,
    children,
}: FundingAccountCardProps) => (
    <Card>
        <CardHeader>
            <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
            <StatFigure label={figureLabel} value={figure} hint={hint} />
            {children && (
                <div className="flex flex-col divide-y divide-border">
                    {children}
                </div>
            )}
        </CardContent>
    </Card>
);
