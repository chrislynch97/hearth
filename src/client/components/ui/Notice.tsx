import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, type LucideIcon } from "lucide-react";

export type NoticeTone = "attention" | "positive" | "info";

export interface NoticeProps {
    tone?: NoticeTone;
    title: ReactNode;
    /** A line of detail under the title. */
    children?: ReactNode;
    /** The one thing to do about it — a button or link, on the right. */
    action?: ReactNode;
}

const TONES: Record<
    NoticeTone,
    { box: string; icon: string; Icon: LucideIcon }
> = {
    attention: {
        box: "border-attention/40 bg-attention-tint",
        icon: "text-attention-fg",
        Icon: CircleAlert,
    },
    positive: {
        box: "border-primary/25 bg-primary-tint-weak",
        icon: "text-primary",
        Icon: CircleCheck,
    },
    info: {
        box: "border-border bg-raised",
        icon: "text-text-muted",
        Icon: Info,
    },
};

/** A page-level message: something needs you (attention), all's well
 *  (positive), or just so you know (info). Every warning on a page uses this,
 *  so they all look alike. */
export const Notice = ({
    tone = "info",
    title,
    children,
    action,
}: NoticeProps) => {
    const { box, icon, Icon } = TONES[tone];

    return (
        <div
            role={tone === "attention" ? "alert" : "status"}
            className={`flex flex-col gap-3 rounded-xl border px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5 ${box}`}
        >
            <div className="flex min-w-0 flex-1 items-start gap-3">
                <Icon
                    size={18}
                    strokeWidth={1.75}
                    className={`mt-0.5 shrink-0 ${icon}`}
                />
                <div className="min-w-0">
                    <p className="text-md font-semibold text-text">{title}</p>
                    {children && (
                        <p className="mt-0.5 text-base text-text-secondary">
                            {children}
                        </p>
                    )}
                </div>
            </div>
            {/* Below the text and full width on a phone, so neither the words
                nor the button get squeezed into a sliver. */}
            {action && (
                <div className="shrink-0 [&>*]:w-full sm:[&>*]:w-auto">
                    {action}
                </div>
            )}
        </div>
    );
};
