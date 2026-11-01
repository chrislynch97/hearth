import { Link } from "@tanstack/react-router";
import { formatMoney } from "@shared/money";
import type { CalendarEvent } from "@shared/calendar";
import type { MoneyFormat } from "@/useMoney";
import { KIND_CHIP, KIND_LABEL, weekdayName } from "@/features/home/calendar";
import { monthName, monthOf } from "@/features/upcoming/model";

export interface CalendarAgendaProps {
    date: string;
    today: boolean;
    events: CalendarEvent[];
    money: MoneyFormat;
}

/** What's on the chosen day, each thing linking to where it lives. Beside the
 *  grid it takes the grid's height and scrolls, so a busy day can't stretch it. */
export const CalendarAgenda = ({
    date,
    today,
    events,
    money,
}: CalendarAgendaProps) => (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg bg-sunken p-4 lg:absolute lg:inset-0 lg:overflow-y-auto">
        <h3 className="flex items-center gap-3 text-text">
            <span className="tabular font-display text-fig-xl leading-none font-medium">
                {Number(date.slice(8, 10))}
            </span>
            <span className="flex min-w-0 flex-col">
                <span className="text-md font-medium">
                    {today ? "Today" : weekdayName(date, money.locale)}
                </span>
                <span className="text-sm font-normal text-text-muted">
                    {monthName(monthOf(date), money.locale)}
                </span>
            </span>
        </h3>
        {events.length === 0 ? (
            <p className="text-base text-text-muted">Nothing on this day.</p>
        ) : (
            <ul className="flex flex-col gap-1.5">
                {events.map((event) => (
                    <li key={event.id}>
                        {/* Each kind builds its own path, so it isn't a route id. */}
                        <Link
                            to={event.href as "/"}
                            className={`flex items-center gap-2.5 rounded-sm border-l-2 px-2.5 py-2 hover:bg-hover ${KIND_CHIP[event.kind]}`}
                        >
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-base font-medium text-text">
                                    {event.title}
                                </span>
                                <span className="block text-sm text-text-secondary">
                                    {KIND_LABEL[event.kind]}
                                </span>
                            </span>
                            {event.amount !== null && (
                                <span className="tabular shrink-0 text-base font-medium text-text">
                                    {formatMoney(event.amount, money)}
                                </span>
                            )}
                        </Link>
                    </li>
                ))}
            </ul>
        )}
    </div>
);
