import { createFileRoute } from "@tanstack/react-router";
import { PayslipsPage } from "@/pages/PayslipsPage";

export const Route = createFileRoute("/payslips")({ component: PayslipsPage });
