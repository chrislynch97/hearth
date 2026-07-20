import { createFileRoute } from "@tanstack/react-router";
import { RaisesPage } from "@/pages/RaisesPage";

export const Route = createFileRoute("/raises")({ component: RaisesPage });
