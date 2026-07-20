import { createFileRoute } from "@tanstack/react-router";
import { SpendingPage } from "@/pages/SpendingPage";

export const Route = createFileRoute("/spending")({ component: SpendingPage });
