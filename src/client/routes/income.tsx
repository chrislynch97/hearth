import { createFileRoute } from "@tanstack/react-router";
import { IncomePage } from "@/pages/IncomePage";

export const Route = createFileRoute("/income")({ component: IncomePage });
