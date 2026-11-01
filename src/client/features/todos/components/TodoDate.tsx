import { useMoney } from "@/useMoney";

export interface TodoDateProps {
    date: string;
    overdue: boolean;
}

/** The diary margin: the day of the month, large, and its weekday. */
export const TodoDate = ({ date, overdue }: TodoDateProps) => {
    const { locale } = useMoney();

    const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
    const weekday = new Intl.DateTimeFormat(locale, {
        weekday: "short",
    }).format(new Date(year, month - 1, day));

    return (
        <div
            className={`flex flex-col items-end ${overdue ? "text-danger" : "text-text"}`}
        >
            <span className="tabular font-display text-h2 leading-none font-medium">
                {day}
            </span>
            <span
                className={`mt-0.5 text-xs ${overdue ? "" : "text-text-muted"}`}
            >
                {weekday}
            </span>
        </div>
    );
};
