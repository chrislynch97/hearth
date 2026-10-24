import { useState } from "react";
import { formatMoney } from "@shared/money";
import { useMoney } from "@/useMoney";
import {
    GIFT_DRAG_TYPE,
    STATUS_LABEL,
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
                "flex cursor-grab flex-col gap-1 rounded-md border px-3 py-2.5 active:cursor-grabbing",
                dragging ? "opacity-40" : "",
                status === "idea"
                    ? "border-dashed border-border-strong"
                    : "border-border bg-raised",
            ].join(" ")}
        >
            <button
                onClick={onEdit}
                aria-label={`Edit ${gift.name} for ${recipient.name}`}
                className="flex items-baseline justify-between gap-2 text-left"
            >
                <span className="min-w-0 truncate text-base text-text">
                    {gift.name}
                </span>
                <span className="tabular shrink-0 text-base font-semibold text-text">
                    {formatMoney(gift.amount, money)}
                </span>
            </button>
            <span className="truncate text-xs text-text-muted">
                For {recipient.name}
                {gift.link && ` · ${gift.link}`}
            </span>
            {next && (
                <button
                    disabled={pending}
                    onClick={() => onAdvance(next)}
                    className="self-start font-semibold text-primary hover:underline disabled:opacity-50"
                >
                    <span className="text-xs">
                        Mark {STATUS_LABEL[next].toLowerCase()} →
                    </span>
                </button>
            )}
        </li>
    );
};
