import { Badge } from "@/components/shadcn/badge";

/** Marks a page that's planned but not built yet. */
export const SoonBadge = () => (
    <Badge
        variant="outline"
        className="h-4 shrink-0 rounded-xs px-1.5 py-0 text-[10px] font-medium text-text-faint"
    >
        Soon
    </Badge>
);
