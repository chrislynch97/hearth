import type { ReactNode } from "react";
import {
    CircleAlert,
    CircleCheck,
    CircleX,
    Info,
    X,
    type LucideIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/shadcn/alert";
import { Button } from "@/components/ui/Button";

export type NoticeTone = "attention" | "positive" | "info" | "danger";

export interface NoticeProps {
    tone?: NoticeTone;
    title: ReactNode;
    /** A line of detail under the title. */
    children?: ReactNode;
    /** The one thing to do about it — a button or link, on the right. */
    action?: ReactNode;
    /** Adds a close button in the corner. */
    onDismiss?: () => void;
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
    danger: {
        box: "border-danger/40 bg-danger-tint",
        icon: "text-danger",
        Icon: CircleX,
    },
    info: {
        box: "border-border bg-raised",
        icon: "text-text-muted",
        Icon: Info,
    },
};

/** A page-level message on shadcn's Alert: something needs you (attention),
 *  something failed (danger), all's well (positive), or just so you know
 *  (info). Every message on a page uses this, so they all look alike. */
export const Notice = ({
    tone = "info",
    title,
    children,
    action,
    onDismiss,
}: NoticeProps) => {
    const { box, icon, Icon } = TONES[tone];

    return (
        <Alert
            role={
                tone === "attention" || tone === "danger" ? "alert" : "status"
            }
            // A third column for the action from `sm` up; below the text, full
            // width, on a phone, so neither gets squeezed into a sliver.
            className={`gap-x-3 rounded-xl px-4 py-4 text-text has-[>svg]:grid-cols-[18px_1fr] sm:px-5 sm:has-[>svg]:grid-cols-[18px_1fr_auto] ${onDismiss ? "sm:pr-12" : ""} ${box}`}
        >
            <Icon strokeWidth={1.75} className={`size-[18px]! ${icon}`} />
            <AlertTitle
                className={`line-clamp-none text-md font-semibold tracking-normal text-text ${onDismiss ? "max-sm:pr-7" : ""}`}
            >
                {title}
            </AlertTitle>
            {children && (
                <AlertDescription className="block text-base text-text-secondary">
                    {children}
                </AlertDescription>
            )}
            {action && (
                <div className="col-span-2 mt-3 [&>*]:w-full sm:col-span-1 sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:mt-0 sm:self-center sm:[&>*]:w-auto">
                    {action}
                </div>
            )}
            {onDismiss && (
                <Button
                    variant="ghost"
                    compact
                    aria-label="Dismiss"
                    className="absolute top-2.5 right-2.5 size-7 px-0"
                    onClick={onDismiss}
                >
                    <X />
                </Button>
            )}
        </Alert>
    );
};
