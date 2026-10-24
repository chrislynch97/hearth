import { createFileRoute } from "@tanstack/react-router";
import { GiftsPage } from "@/pages/GiftsPage";

/** The occasion on screen lives in the URL, so a refresh comes back to it. */
export interface GiftsSearch {
    /** An occasion id. Absent means the next one coming up. */
    occasion?: string;
}

export const Route = createFileRoute("/gifts")({
    validateSearch: (search: Record<string, unknown>): GiftsSearch =>
        typeof search.occasion === "string" && search.occasion
            ? { occasion: search.occasion }
            : {},
    component: GiftsPage,
});
