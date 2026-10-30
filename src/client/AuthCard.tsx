import type { ReactNode } from "react";
import { HearthMark } from "@/components/HearthMark";
import { Card, CardContent } from "@/components/shadcn/card";

export interface AuthCardProps {
    /** The line under the logo saying what this screen is for. */
    lead?: ReactNode;
    children?: ReactNode;
}

/** The centred, branded card for every screen outside the app shell: login,
 *  invite acceptance, password reset, address verification, a failed load. */
export const AuthCard = ({ lead, children }: AuthCardProps) => (
    <main className="hearth-ds flex min-h-dvh items-center justify-center bg-bg p-4 text-base">
        <Card className="w-full max-w-[380px]">
            <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-center gap-2.5">
                        <HearthMark size={28} color="var(--color-primary)" />
                        <h1 className="font-display text-h2 font-medium text-text">
                            Hearth
                        </h1>
                    </div>
                    {lead && (
                        <p className="text-center text-base text-text-muted">
                            {lead}
                        </p>
                    )}
                </div>
                {children}
            </CardContent>
        </Card>
    </main>
);
