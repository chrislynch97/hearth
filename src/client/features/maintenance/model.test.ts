import { describe, expect, it } from "vitest";
import {
    groupJobs,
    parseRepeat,
    recentlyDone,
    repeatOptionsFor,
    repeatValue,
    spentThisYear,
    type MaintenanceJobWithLog,
    type MaintenanceLogRow,
} from "@/features/maintenance/model";

const job = (
    fields: Partial<MaintenanceJobWithLog> = {}
): MaintenanceJobWithLog => ({
    id: "job",
    householdId: "household",
    name: "Boiler service",
    area: "heating",
    notes: null,
    assigneeId: null,
    dueDate: "2026-12-01",
    repeatEvery: 12,
    repeatUnit: "month",
    remindDays: 30,
    remindedFor: null,
    archivedAt: null,
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
    log: [],
    ...fields,
});

const entry = (
    doneOn: string,
    amount: number | null = null
): MaintenanceLogRow => ({
    id: doneOn,
    householdId: "household",
    jobId: "job",
    doneOn,
    doneById: null,
    amount,
    note: null,
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
});

describe("repeat values", () => {
    it("round-trips a repeat through its choice value", () => {
        expect(parseRepeat(repeatValue(2, "week"))).toEqual({
            repeatEvery: 2,
            repeatUnit: "week",
        });
        expect(parseRepeat("once").repeatEvery).toBeNull();
    });

    it("offers a job's own repeat when it isn't a preset", () => {
        const options = repeatOptionsFor(18, "month");
        expect(options.at(-1)).toEqual({
            value: "18:month",
            label: "Every 18 months",
        });
        expect(
            repeatOptionsFor(12, "month").some((o) => o.value === "18:month")
        ).toBe(false);
    });
});

describe("groupJobs", () => {
    it("sorts live jobs by how pressing they are and keeps archived apart", () => {
        const today = "2026-11-02";
        const groups = groupJobs(
            [
                job({ id: "later", dueDate: "2027-01-10" }),
                job({ id: "soon", dueDate: "2026-12-02" }),
                job({ id: "overdue", dueDate: "2026-11-01" }),
                job({ id: "gone", archivedAt: new Date() }),
            ],
            today
        );

        expect(groups.overdue.map((j) => j.id)).toEqual(["overdue"]);
        expect(groups.soon.map((j) => j.id)).toEqual(["soon"]);
        expect(groups.later.map((j) => j.id)).toEqual(["later"]);
        expect(groups.archived.map((j) => j.id)).toEqual(["gone"]);
    });
});

describe("history across jobs", () => {
    const jobs = [
        job({
            id: "a",
            log: [entry("2026-10-01", 9000), entry("2025-06-01", 8000)],
        }),
        job({ id: "b", log: [entry("2026-11-01")] }),
    ];

    it("lists the newest first", () => {
        expect(recentlyDone(jobs, 2).map((r) => r.entry.doneOn)).toEqual([
            "2026-11-01",
            "2026-10-01",
        ]);
    });

    it("totals the last twelve months", () => {
        expect(spentThisYear(jobs, "2026-11-02")).toBe(9000);
    });
});
