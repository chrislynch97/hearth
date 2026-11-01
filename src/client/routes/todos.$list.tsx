import { createFileRoute } from "@tanstack/react-router";
import { TodosPage } from "@/pages/TodosPage";

/** One list: `/todos/k3x9p2-wedding`. The short id at the front finds it; the
 *  name after it is for reading and follows renames. */
export const Route = createFileRoute("/todos/$list")({
    component: TodosPage,
});
