import { createFileRoute } from "@tanstack/react-router";
import { UpcomingPage } from "@/pages/UpcomingPage";

export const Route = createFileRoute("/upcoming")({ component: UpcomingPage });
