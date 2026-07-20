import { createFileRoute } from "@tanstack/react-router";
import { BillReviewPage } from "@/pages/BillReviewPage";

export const Route = createFileRoute("/review")({ component: BillReviewPage });
