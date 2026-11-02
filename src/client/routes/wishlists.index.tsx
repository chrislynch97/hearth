import { createFileRoute } from "@tanstack/react-router";
import { WishlistsPage } from "@/pages/WishlistsPage";

export const Route = createFileRoute("/wishlists/")({
    component: WishlistsPage,
});
