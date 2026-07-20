import { createFileRoute } from "@tanstack/react-router";
import { CatchupPage } from "@/pages/CatchupPage";

export const Route = createFileRoute("/catchup")({ component: CatchupPage });
