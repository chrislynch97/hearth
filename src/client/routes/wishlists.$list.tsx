import { createFileRoute } from "@tanstack/react-router";
import { WishlistsPage } from "@/pages/WishlistsPage";

/** One list: `/wishlists/k3x9p2-kitchen`. The short id at the front finds it; the
 *  name after it is for reading and follows renames. */
export const Route = createFileRoute("/wishlists/$list")({
    component: WishlistsPage,
});
