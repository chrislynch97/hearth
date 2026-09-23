import { Link } from "@tanstack/react-router";
import { PlanIcon } from "@/features/plan/components/PlanIcon";

/** Bill review left the sidebar when Bills folded into this page, so this is
 *  its way in. */
export const BillReviewLink = () => (
    <Link
        to="/review"
        className="inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium text-text-secondary transition-colors duration-[140ms] ease-out hover:bg-hover"
    >
        <PlanIcon name="review" size={15} />
        Bill review
    </Link>
);
