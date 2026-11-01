import type { ComponentProps } from "react";
import { Button } from "@/components/ui/Button";

export interface FilterChipProps extends ComponentProps<typeof Button> {
    active: boolean;
}

/** A pill you tap to narrow or switch what's on screen. */
export const FilterChip = ({
    active,
    className = "",
    ...rest
}: FilterChipProps) => (
    <Button
        variant={active ? "solid" : "outline"}
        compact
        aria-pressed={active}
        className={`rounded-full max-sm:h-9 max-sm:px-3.5 ${className}`}
        {...rest}
    />
);
