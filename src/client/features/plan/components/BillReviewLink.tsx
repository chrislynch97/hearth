import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/Button";
import { PlanIcon } from "@/features/plan/components/PlanIcon";

/** Bill review left the sidebar when Bills folded into this page, so this is
 *  its way in. */
export const BillReviewLink = () => (
    <Button variant="ghost" asChild className="h-9 max-sm:w-full">
        <Link to="/review">
            <PlanIcon name="review" size={15} />
            Bill review
        </Link>
    </Button>
);
