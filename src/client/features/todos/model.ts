import { addDays, subtractMonths } from "@shared/dates";
import { comparePriority, type Priority } from "@shared/priority";
import { dueLabel } from "@/lib/due";
import type { TodoListSummary } from "../../../server/features/todos/todoLists.router";
import type { TodoWithDetails } from "../../../server/features/todos/todos.router";

export type { TodoListSummary, TodoWithDetails };

export const PRIORITY_OPTIONS: Array<{ value: Priority; label: string }> = [
    { value: "high", label: "High" },
    { value: "normal", label: "Normal" },
    { value: "low", label: "Low" },
];

/** Soonest deadline first, undated after, then the more urgent, then oldest. */
export const compareTodos = (
    a: TodoWithDetails,
    b: TodoWithDetails
): number => {
    if (a.dueDate !== b.dueDate) {
        if (a.dueDate === null) return 1;
        if (b.dueDate === null) return -1;

        return a.dueDate < b.dueDate ? -1 : 1;
    }

    return (
        comparePriority(a.priority, b.priority) ||
        a.createdAt.getTime() - b.createdAt.getTime()
    );
};

export interface TodoFilter {
    /** A list id. Absent means every list. */
    list?: string;
    /** To-dos must carry all of these. */
    tags?: string[];
    /** A member id. */
    person?: string;
}

export const filterTodos = (
    todos: TodoWithDetails[],
    { list, tags = [], person }: TodoFilter
): TodoWithDetails[] =>
    todos.filter(
        (todo) =>
            (!list || todo.listId === list) &&
            (!person || todo.assigneeId === person) &&
            tags.every((tag) => todo.tags.includes(tag))
    );

export interface TodoSections {
    open: TodoWithDetails[];
    done: TodoWithDetails[];
}

/** Open to-dos by deadline, and done ones most recently ticked first. */
export const splitTodos = (todos: TodoWithDetails[]): TodoSections => ({
    open: todos.filter((t) => t.completedAt === null).sort(compareTodos),
    done: todos
        .filter((t) => t.completedAt !== null)
        .sort(
            (a, b) =>
                (b.completedAt?.getTime() ?? 0) -
                (a.completedAt?.getTime() ?? 0)
        ),
});

export interface TodoSection {
    title: string;
    overdue: boolean;
    todos: TodoWithDetails[];
}

/** The diary: anything late, then a section per month, then the undated. Takes
 *  open to-dos already in deadline order. */
export const todoSections = (
    open: TodoWithDetails[],
    today: string,
    monthTitle: (date: string) => string
): TodoSection[] => {
    const sections = new Map<string, TodoSection>();
    const add = (key: string, title: string, todo: TodoWithDetails) => {
        const section = sections.get(key) ?? { title, overdue: false, todos: [] };
        section.todos.push(todo);
        sections.set(key, section);
    };

    for (const todo of open) {
        if (!todo.dueDate) add("none", "No deadline", todo);
        else if (todo.dueDate < today) add("late", "Overdue", todo);
        else add(todo.dueDate.slice(0, 7), monthTitle(todo.dueDate), todo);
    }
    const late = sections.get("late");
    if (late) late.overdue = true;

    return [...sections.values()];
};

/** The line under the page title: how much is left and what's next. */
export const todoSummary = (
    open: TodoWithDetails[],
    doneCount: number,
    today: string,
    formatDate: (date: string) => string
): string => {
    if (open.length === 0) {
        return doneCount > 0 ? "All done." : "Nothing to do yet.";
    }

    const left = open.length === 1 ? "1 to go" : `${open.length} to go`;
    const next = open[0];
    if (!next?.dueDate) return `${left}.`;

    const when = dueLabel(next.dueDate, today, formatDate(next.dueDate));

    return `${left}. Next up: ${next.title}, ${when.toLowerCase()}.`;
};

/** Every tag in use, for the filter and the picker. */
export const allTags = (items: Array<{ tags: string[] }>): string[] =>
    [...new Set(items.flatMap((item) => item.tags))].sort((a, b) =>
        a.localeCompare(b)
    );

const pad = (n: number): string => String(n).padStart(2, "0");

/** A moment as a `datetime-local` value, in the browser's zone. */
export const toLocalInput = (date: Date): string =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** 09:00 on a calendar day, in the browser's zone. */
const morningOf = (day: string): Date => new Date(`${day}T09:00`);

export interface ReminderShortcut {
    label: string;
    at: Date;
}

/** Reminders relative to the deadline, leaving out any already gone. */
export const reminderShortcuts = (
    dueDate: string,
    now: Date
): ReminderShortcut[] =>
    [
        { label: "Morning of the deadline", at: morningOf(dueDate) },
        { label: "1 week before", at: morningOf(addDays(dueDate, -7)) },
        { label: "1 month before", at: morningOf(subtractMonths(dueDate, 1)) },
    ].filter(({ at }) => at > now);
