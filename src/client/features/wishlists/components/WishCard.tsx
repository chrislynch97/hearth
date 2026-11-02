import { externalLink } from "@shared/links";
import { formatMoney } from "@shared/money";
import { useFormatDate, useMoney } from "@/useMoney";
import { Badge } from "@/components/shadcn/badge";
import { Checkbox } from "@/components/shadcn/checkbox";
import { Button } from "@/components/ui/Button";
import { toLocalInput } from "@/features/todos/model";
import type { WishlistItemWithTags } from "@/features/wishlists/model";

export interface WishCardProps {
    item: WishlistItemWithTags;
    /** Resolved by the page, so a card does no lookups of its own. */
    wantedByName: string | null;
    boughtByName: string | null;
    /** Only when the page is showing more than one list. */
    listName: string | null;
    pending: boolean;
    onToggle: () => void;
    onEdit: () => void;
}

/** One thing to buy: a card from `sm` up, a ruled row on a phone. The shop link
 *  sits outside the edit button, so tapping it doesn't open the sheet. */
export const WishCard = ({
    item,
    wantedByName,
    boughtByName,
    listName,
    pending,
    onToggle,
    onEdit,
}: WishCardProps) => {
    const money = useMoney();
    const formatDate = useFormatDate();

    const bought = item.boughtAt !== null;
    const link = externalLink(item.link);
    const shop = !link ? item.link : null;
    const boughtOn = item.boughtAt
        ? `Bought ${boughtByName ? `by ${boughtByName}, ` : ""}${formatDate(toLocalInput(item.boughtAt).slice(0, 10))}`
        : null;
    const wanter = wantedByName === boughtByName ? null : wantedByName;
    const details = [boughtOn, wanter, listName, shop].filter(
        (detail): detail is string => Boolean(detail)
    );

    return (
        <li className="flex items-start gap-2.5 border-border max-sm:border-b max-sm:py-3 sm:rounded-xl sm:border sm:bg-card sm:p-3 sm:shadow-raised">
            <Checkbox
                checked={bought}
                disabled={pending}
                aria-label={`Bought: ${item.name}`}
                onCheckedChange={onToggle}
                className="mt-0.5 size-5 sm:size-4"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Button
                    variant="ghost"
                    className="h-auto min-h-6 items-start justify-between gap-3 px-0 py-0 text-left font-normal whitespace-normal hover:bg-transparent"
                    onClick={onEdit}
                >
                    <span
                        className={
                            bought
                                ? "min-w-0 text-md text-text-faint line-through"
                                : "min-w-0 text-md font-medium text-text"
                        }
                    >
                        {item.name}
                    </span>
                    {item.price !== null && (
                        <span
                            className={`tabular shrink-0 text-md font-semibold ${bought ? "text-text-faint" : "text-text"}`}
                        >
                            {formatMoney(item.price, money)}
                        </span>
                    )}
                </Button>
                {(details.length > 0 || link) && (
                    <span className="flex flex-wrap gap-x-3 text-sm text-text-muted">
                        {details.map((detail) => (
                            <span key={detail}>{detail}</span>
                        ))}
                        {link && (
                            <a
                                href={link.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary underline-offset-2 hover:underline"
                            >
                                {link.label}
                            </a>
                        )}
                    </span>
                )}
                {item.notes && !bought && (
                    <p className="line-clamp-2 text-sm text-text-muted">
                        {item.notes}
                    </p>
                )}
                {item.tags.length > 0 && !bought && (
                    <span className="flex flex-wrap gap-1">
                        {item.tags.map((tag) => (
                            <Badge key={tag} variant="tint">
                                {tag}
                            </Badge>
                        ))}
                    </span>
                )}
            </div>
        </li>
    );
};
