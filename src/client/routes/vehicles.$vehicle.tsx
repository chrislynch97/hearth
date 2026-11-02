import { createFileRoute } from "@tanstack/react-router";
import { VehiclePage } from "@/pages/VehiclePage";

/** One vehicle: `/vehicles/k3x9p2-golf`. The short id at the front finds it;
 *  the name after it is for reading and follows renames. */
export const Route = createFileRoute("/vehicles/$vehicle")({
    component: VehiclePage,
});
