import { useState, type DragEvent, type ReactNode } from "react";
import { formatMoney } from "@shared/money";
import { useMoney } from "@/useMoney";
import { GiftTile } from "@/features/gifts/components/GiftTile";
import {
    COLUMN_TITLE,
    GIFT_DRAG_TYPE,
    type GiftColumnData,
    type GiftStatus,
    type GiftWithRecipient,
} from "@/features/gifts/model";

export interface GiftColumnProps {
    column: GiftColumnData;
    pendingGiftId: string | null;
    onEditGift: (item: GiftWithRecipient) => void;
    onAdvanceGift: (item: GiftWithRecipient, status: GiftStatus) => void;
    /** A gift card dropped here, by id. */
    onDropGift: (giftId: string) => void;
    /** Under the tiles — the add button, on the To buy column. */
    footer?: ReactNode;
}

const EMPTY: Record<GiftStatus, string> = {
    idea: "Nothing left to buy.",
    bought: "Nothing bought yet.",
    given: "Nothing given yet.",
};

export const GiftColumn = ({
    column,
    pendingGiftId,
    onEditGift,
    onAdvanceGift,
    onDropGift,
    footer,
}: GiftColumnProps) => {
    const [over, setOver] = useState(false);
    const money = useMoney();

    const title = COLUMN_TITLE[column.status];
    const carriesGift = (event: DragEvent) =>
        event.dataTransfer.types.includes(GIFT_DRAG_TYPE);

    return (
        <section
            aria-label={title}
            onDragOver={(event) => {
                if (!carriesGift(event)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setOver(true);
            }}
            // Leaving for one of its own tiles is still over the column.
            onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node))
                    setOver(false);
            }}
            onDrop={(event) => {
                setOver(false);
                if (!carriesGift(event)) return;
                event.preventDefault();
                onDropGift(event.dataTransfer.getData(GIFT_DRAG_TYPE));
            }}
            className={[
                "-m-1.5 flex min-h-24 min-w-0 flex-col gap-2 rounded-md p-1.5 outline-dashed outline-1 transition-colors duration-[140ms] ease-out",
                over
                    ? "bg-primary-tint-weak outline-primary"
                    : "outline-transparent",
            ].join(" ")}
        >
            <h2 className="flex items-baseline justify-between gap-2 text-eyebrow font-semibold uppercase text-text-muted">
                <span>
                    {title} · {column.gifts.length}
                </span>
                <span className="tabular">
                    {formatMoney(column.total, money)}
                </span>
            </h2>
            {column.gifts.length > 0 ? (
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {column.gifts.map((item) => (
                        <GiftTile
                            key={item.gift.id}
                            item={item}
                            pending={pendingGiftId === item.gift.id}
                            onEdit={() => onEditGift(item)}
                            onAdvance={(status) => onAdvanceGift(item, status)}
                        />
                    ))}
                </ul>
            ) : (
                <p className="text-sm text-text-muted">
                    {EMPTY[column.status]}
                </p>
            )}
            {footer}
        </section>
    );
};
