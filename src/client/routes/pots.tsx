import { createFileRoute } from "@tanstack/react-router";
import { PotsPage } from "@/pages/PotsPage";

export const Route = createFileRoute("/pots")({ component: PotsPage });
