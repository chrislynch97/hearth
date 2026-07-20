import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// The route tree is generated from src/client/routes/ by the TanStack Router
// vite plugin — add a file there rather than editing routeTree.gen.ts.
// `defaultPreload: 'intent'` fetches a route's chunk on link hover/touchstart so
// the click itself is instant despite the pages being code-split.
export const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}
