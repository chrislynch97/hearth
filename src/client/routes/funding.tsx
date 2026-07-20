import { createFileRoute } from "@tanstack/react-router";
import { FundingPage } from "@/pages/FundingPage";

export const Route = createFileRoute("/funding")({ component: FundingPage });
