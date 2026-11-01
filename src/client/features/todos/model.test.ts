import { describe, expect, it } from "vitest";
import {
    allTags,
    dueLabel,
    dueStatus,
    filterTodos,
    reminderShortcuts,
    splitTodos,
    toLocalInput,
    todoSections,
    todoSummary,
    type TodoWithDetails,
} from "./model";

const todo = (fields: Partial<TodoWithDetails>): TodoWithDetails => ({
    id: fields.title ?? "todo",
    householdId: "household",
    listId: null,
    title: "A job",
    notes: null,
    priority: "normal",
    assigneeId: null,
    dueDate: null,
    completedAt: null,
    completedById: null,
    archivedAt: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    tags: [],
    reminders: [],
    ...fields,
});

describe("dueStatus and dueLabel", () => {
    const today = "2026-06-10";

    it("sorts deadlines into how pressing they are", () => {
        expect(dueStatus("2026-06-09", today)).toBe("overdue");
        expect(dueStatus("2026-06-10", today)).toBe("today");
        expect(dueStatus("2026-06-17", today)).toBe("soon");
        expect(dueStatus("2026-06-18", today)).toBe("later");
    });

    it("words near deadlines and dates far ones", () => {
        expect(dueLabel("2026-06-10", today, "x")).toBe("Today");
        expect(dueLabel("2026-06-11", today, "x")).toBe("Tomorrow");
        expect(dueLabel("2026-06-09", today, "x")).toBe("Yesterday");
        expect(dueLabel("2026-06-07", today, "x")).toBe("3 days late");
        expect(dueLabel("2026-06-13", today, "x")).toBe("In 3 days");
        expect(dueLabel("2026-08-01", today, "1 Aug")).toBe("1 Aug");
    });
});

describe("splitTodos", () => {
    it("puts the soonest deadline first and undated ones after", () => {
        const { open } = splitTodos([
            todo({ title: "Undated" }),
            todo({ title: "Later", dueDate: "2026-09-01" }),
            todo({ title: "Soon", dueDate: "2026-03-01" }),
        ]);

        expect(open.map((t) => t.title)).toEqual(["Soon", "Later", "Undated"]);
    });

    it("breaks a tied deadline on priority, then age", () => {
        const dueDate = "2026-03-01";
        const { open } = splitTodos([
            todo({ title: "Newer", dueDate, createdAt: new Date("2026-02-02") }),
            todo({ title: "Low", dueDate, priority: "low" }),
            todo({ title: "Older", dueDate, createdAt: new Date("2026-02-01") }),
            todo({ title: "High", dueDate, priority: "high" }),
        ]);

        expect(open.map((t) => t.title)).toEqual([
            "High",
            "Older",
            "Newer",
            "Low",
        ]);
    });

    it("keeps done ones apart, most recently ticked first", () => {
        const { open, done } = splitTodos([
            todo({ title: "First", completedAt: new Date("2026-01-01") }),
            todo({ title: "Open" }),
            todo({ title: "Second", completedAt: new Date("2026-02-01") }),
        ]);

        expect(open.map((t) => t.title)).toEqual(["Open"]);
        expect(done.map((t) => t.title)).toEqual(["Second", "First"]);
    });
});

describe("filterTodos", () => {
    const todos = [
        todo({ title: "A", listId: "wedding", tags: ["Venue", "Food"] }),
        todo({ title: "B", listId: "wedding", tags: ["Venue"], assigneeId: "ana" }),
        todo({ title: "C", tags: ["Food"], assigneeId: "ana" }),
    ];
    const titles = (filter: Parameters<typeof filterTodos>[1]) =>
        filterTodos(todos, filter).map((t) => t.title);

    it("shows everything with no filter", () => {
        expect(titles({})).toEqual(["A", "B", "C"]);
    });

    it("narrows by list and person", () => {
        expect(titles({ list: "wedding" })).toEqual(["A", "B"]);
        expect(titles({ person: "ana" })).toEqual(["B", "C"]);
    });

    it("wants every picked tag, not just one", () => {
        expect(titles({ tags: ["Venue"] })).toEqual(["A", "B"]);
        expect(titles({ tags: ["Venue", "Food"] })).toEqual(["A"]);
    });

    it("combines them", () => {
        expect(titles({ list: "wedding", tags: ["Venue"], person: "ana" })).toEqual(
            ["B"]
        );
    });
});

describe("todoSections", () => {
    const month = (date: string) => date.slice(0, 7);

    it("gathers the late, then each month, then the undated", () => {
        const { open } = splitTodos([
            todo({ title: "Undated" }),
            todo({ title: "Late", dueDate: "2026-06-01" }),
            todo({ title: "Today", dueDate: "2026-06-10" }),
            todo({ title: "July", dueDate: "2026-07-02" }),
            todo({ title: "June", dueDate: "2026-06-20" }),
        ]);

        const sections = todoSections(open, "2026-06-10", month);

        expect(
            sections.map((s) => [s.title, s.todos.map((t) => t.title)])
        ).toEqual([
            ["Overdue", ["Late"]],
            ["2026-06", ["Today", "June"]],
            ["2026-07", ["July"]],
            ["No deadline", ["Undated"]],
        ]);
        expect(sections.map((s) => s.overdue)).toEqual([
            true,
            false,
            false,
            false,
        ]);
    });
});

describe("todoSummary", () => {
    const today = "2026-06-10";
    const summary = (open: TodoWithDetails[], done = 0) =>
        todoSummary(open, done, today, () => "1 Aug");

    it("says what's left and what's next", () => {
        expect(
            summary([
                todo({ title: "Book the band", dueDate: "2026-06-08" }),
                todo({ title: "Cake" }),
            ])
        ).toBe("2 to go. Next up: Book the band, 2 days late.");
    });

    it("leaves out next when nothing has a deadline", () => {
        expect(summary([todo({})])).toBe("1 to go.");
    });

    it("tells finished from empty", () => {
        expect(summary([], 3)).toBe("All done.");
        expect(summary([])).toBe("Nothing to do yet.");
    });
});

describe("allTags", () => {
    it("gives each tag once, sorted", () => {
        expect(
            allTags([
                todo({ tags: ["Venue", "Food"] }),
                todo({ tags: ["Food", "Guests"] }),
            ])
        ).toEqual(["Food", "Guests", "Venue"]);
    });
});

describe("reminderShortcuts", () => {
    const labels = (now: Date) =>
        reminderShortcuts("2026-06-30", now).map((s) => s.label);

    it("offers all three while they're ahead", () => {
        expect(labels(new Date("2026-01-01T12:00"))).toEqual([
            "Morning of the deadline",
            "1 week before",
            "1 month before",
        ]);
    });

    it("drops the ones already gone", () => {
        expect(labels(new Date("2026-06-25T12:00"))).toEqual([
            "Morning of the deadline",
        ]);
        expect(labels(new Date("2026-07-01T12:00"))).toEqual([]);
    });

    it("lands at nine in the morning", () => {
        const [morning] = reminderShortcuts(
            "2026-06-30",
            new Date("2026-01-01T12:00")
        );

        expect(toLocalInput(morning!.at)).toBe("2026-06-30T09:00");
    });
});
