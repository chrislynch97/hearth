import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { formatMoney } from "@shared/money";
import { useMoney } from "@/useMoney";
import { Button } from "@/components/ui/Button";
import {
    GIFT_DRAG_TYPE,
    STATUS_LABEL,
    giftLink,
    nextStatus,
    type GiftStatus,
    type GiftWithRecipient,
} from "@/features/gifts/model";

export interface GiftTileProps {
    item: GiftWithRecipient;
    pending: boolean;
    onEdit: () => void;
    onAdvance: (status: GiftStatus) => void;
}

/** A gift in its column: what, for whom, how much, and the tap that moves it
 *  on. Ideas are dashed — not bought, not counted as spent. Drag it to another
 *  column to move it either way; the button is there for keyboards and phones. */
export const GiftTile = ({
    item,
    pending,
    onEdit,
    onAdvance,
}: GiftTileProps) => {
    const [dragging, setDragging] = useState(false);
    const money = useMoney();

    const { gift, recipient } = item;
    const status = gift.status as GiftStatus;
    const next = nextStatus(status);
    const link = giftLink(gift.link);

    return (
        <li
            draggable
            onDragStart={(event) => {
                event.dataTransfer.setData(GIFT_DRAG_TYPE, gift.id);
                event.dataTransfer.effectAllowed = "move";
                setDragging(true);
            }}
            onDragEnd={() => setDragging(false)}
            className={[
                "flex cursor-grab flex-col gap-1 rounded-xl border p-3 active:cursor-grabbing",
                dragging ? "opacity-40" : "",
                status === "idea"
                    ? "border-dashed border-border-strong"
                    : "border-border bg-card shadow-raised",
            ].join(" ")}
        >
            <Button
                variant="ghost"
                onClick={onEdit}
                aria-label={`Edit ${gift.name} for ${recipient.name}`}
                className="h-auto min-h-6 justify-between gap-2 px-0 py-0 text-left font-normal hover:bg-transparent"
            >
                <span className="min-w-0 truncate text-base text-text">
                    {gift.name}
                </span>
                <span className="tabular shrink-0 text-base font-semibold text-text">
                    {formatMoney(gift.amount, money)}
                </span>
            </Button>
            <span className="truncate text-sm text-text-muted">
                For {recipient.name}
                {gift.link && " · "}
                {link ? (
                    <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        draggable={false}
                        className="text-primary underline-offset-2 hover:underline"
                    >
                        {link.label}
                    </a>
                ) : (
                    gift.link
                )}
            </span>
            {next && (
                <Button
                    compact
                    disabled={pending}
                    className="mt-1 self-start max-sm:h-9 max-sm:w-full"
                    onClick={() => onAdvance(next)}
                >
                    Mark {STATUS_LABEL[next].toLowerCase()}
                    <ArrowRight />
                </Button>
            )}
        </li>
    );
};
