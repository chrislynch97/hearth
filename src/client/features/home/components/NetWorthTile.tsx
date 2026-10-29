import { Link } from "@tanstack/react-router";
import { Sparkline } from "@microcharts/react/sparkline";
import { formatMoney } from "@shared/money";
import { moneyFormat } from "@/microcharts";
import { useFormatDate, type MoneyFormat } from "@/useMoney";
import { useElementSize } from "@/useElementSize";
import { Card, CardContent } from "@/components/shadcn/card";
import { StatFigure } from "@/components/ui/StatFigure";
import { StatRow } from "@/components/ui/StatRow";

export interface NetWorthTileProps {
    data: {
        assets: number;
        liabilities: number;
        netWorth: number;
        timeline: Array<{ date: string; netWorth: number }>;
    };
    money: MoneyFormat;
}

// Until the first measurement lands; never broken, just small.
const FALLBACK = { width: 200, height: 64 };

/** Current standing (period-independent), linking through to /accounts. The
 *  sparkline takes whatever height the card is given, so it sits flush beside
 *  a taller neighbour rather than leaving a hole. */
export const NetWorthTile = ({ data, money }: NetWorthTileProps) => {
    const { ref, width, height } = useElementSize<HTMLDivElement>();
    const formatDate = useFormatDate();

    const hasData =
        data.assets !== 0 || data.liabilities !== 0 || data.timeline.length > 0;
    if (!hasData) return null;

    const spark = data.timeline.slice(-12);
    const first = spark[0];
    const change = first ? data.netWorth - first.netWorth : 0;

    return (
        <Link to="/accounts" className="group block h-full rounded-xl">
            <Card className="h-full transition-colors duration-[140ms] ease-out group-hover:border-border-strong">
                <CardContent className="flex h-full flex-col gap-4">
                    <StatFigure
                        label="Net worth"
                        value={formatMoney(data.netWorth, money)}
                        tone={data.netWorth < 0 ? "danger" : "default"}
                        hint={
                            spark.length >= 2 ? (
                                <span
                                    className={
                                        change >= 0
                                            ? "text-positive-fg"
                                            : "text-danger"
                                    }
                                >
                                    {change >= 0 ? "+" : "−"}
                                    {formatMoney(
                                        Math.abs(change),
                                        money
                                    )} since {formatDate(first!.date)}
                                </span>
                            ) : undefined
                        }
                    />
                    {spark.length >= 2 && (
                        // Measured box, chart pinned inside it: the SVG can't
                        // push its own container taller and loop the resize.
                        <div ref={ref} className="relative min-h-16 flex-1">
                            <div className="absolute inset-0">
                                <Sparkline
                                    data={spark.map((p) => p.netWorth)}
                                    width={width || FALLBACK.width}
                                    height={height || FALLBACK.height}
                                    fill
                                    format={moneyFormat(money)}
                                    title="Net worth over the last 12 recorded points"
                                />
                            </div>
                        </div>
                    )}
                    <div className="flex flex-col gap-1.5">
                        <StatRow
                            label="Assets"
                            value={formatMoney(data.assets, money)}
                        />
                        <StatRow
                            label="Liabilities"
                            value={formatMoney(data.liabilities, money)}
                        />
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
};
