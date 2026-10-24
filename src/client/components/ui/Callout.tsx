import type { ReactNode } from "react";

export type CalloutTone = "info" | "attention";

export interface CalloutProps {
    tone?: CalloutTone;
    title?: ReactNode;
    className?: string;
    children: ReactNode;
}

const TONES: Record<CalloutTone, string> = {
    info: "border-border-strong bg-primary-tint-weak",
    attention: "border-attention bg-attention-tint",
};

const TITLE_TONES: Record<CalloutTone, string> = {
    info: "text-text",
    attention: "text-attention-fg",
};

/** A boxed note inside a card: something to know or act on, never an error. */
export const Callout = ({
    tone = "info",
    title,
    className = "",
    children,
}: CalloutProps) => (
    <div
        role="note"
        className={[
            "rounded-md border-l-[3px] px-3.5 py-3 text-base text-text",
            TONES[tone],
            className,
        ].join(" ")}
    >
        {title && (
            <p className={`mb-1 font-semibold ${TITLE_TONES[tone]}`}>{title}</p>
        )}
        {children}
    </div>
);
