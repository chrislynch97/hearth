import type { ReactNode } from "react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/shadcn/card";

export interface StepCardProps {
    title: string;
    description?: ReactNode;
    children: ReactNode;
}

/** One step of the setup wizard. */
export const StepCard = ({ title, description, children }: StepCardProps) => (
    <Card>
        <CardHeader>
            <CardTitle className="text-text">{title}</CardTitle>
            {description && (
                <CardDescription className="text-base text-text-muted">
                    {description}
                </CardDescription>
            )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
);
