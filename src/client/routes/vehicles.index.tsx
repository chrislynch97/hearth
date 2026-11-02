import { createFileRoute } from "@tanstack/react-router";
import { VehiclesPage } from "@/pages/VehiclesPage";

export const Route = createFileRoute("/vehicles/")({
    component: VehiclesPage,
});
