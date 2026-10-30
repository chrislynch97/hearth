import { useState } from "react";
import { sortBillReview, type BillReviewSort } from "@shared/billReview";
import { trpc } from "@/trpc";
import { useMoney } from "@/useMoney";
import { Card, CardContent } from "@/components/shadcn/card";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Spinner } from "@/components/ui/Spinner";
import { BillReviewRowItem } from "@/features/review/components/BillReviewRowItem";

/** Bills ranked by how much they've grown in a year: the fastest climbers, not
 *  the biggest, are the ones worth a second look. */
export const BillReviewPage = () => {
    const money = useMoney();
    const reviewQuery = trpc.billReview.review.useQuery();
    const [sort, setSort] = useState<BillReviewSort>("annual");

    const rows = sortBillReview(reviewQuery.data ?? [], sort);
    const sorts: Array<{ value: BillReviewSort; label: string }> = [
        { value: "annual", label: `By ${money.symbol}/yr` },
        { value: "percent", label: "By %" },
    ];

    return (
        <div className="hearth-ds mx-auto flex max-w-[1000px] flex-col gap-5">
            <PageHeader
                title="Bill review"
                description="Your bills and subscriptions, ranked by how much they've grown over the last 12 months."
                actions={
                    rows.length > 0 && (
                        <SegmentedControl
                            label="Sort by"
                            options={sorts}
                            value={sort}
                            onChange={setSort}
                            className="w-full sm:w-auto [&>*]:flex-1"
                        />
                    )
                }
            />
            {reviewQuery.isLoading && <Spinner label="Loading the review" />}
            {!reviewQuery.isLoading && rows.length === 0 && (
                <Card>
                    <CardContent className="text-base text-text-muted">
                        No active bills to review yet. Add some on the Plan
                        page.
                    </CardContent>
                </Card>
            )}
            {rows.length > 0 && (
                <Card>
                    <CardContent>
                        <ul className="flex flex-col divide-y divide-border">
                            {rows.map((row) => (
                                <BillReviewRowItem
                                    key={row.id}
                                    row={row}
                                    money={money}
                                />
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};
