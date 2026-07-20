import { describe, it, expect } from "vitest";
import { groupedPotOptions, orderMembers } from "./potOptions";
import type { Member, Pot } from "../server/db/schema";

const member = (
    over: Partial<Member> & Pick<Member, "id" | "displayName">
): Member =>
    ({
        kind: "person",
        shortLabel: over.displayName[0],
        color: "grape",
        jointContributionWeight: null,
        sortOrder: 0,
        archivedAt: null,
        ...over,
    }) as Member;

const pot = (over: Partial<Pot> & Pick<Pot, "id" | "name" | "ownerId">): Pot =>
    ({ archivedAt: null, ...over }) as Pot;

describe("orderMembers", () => {
    it("puts persons before joint", () => {
        const joint = member({
            id: "j",
            displayName: "Joint",
            kind: "joint",
            sortOrder: 100,
        });
        const ava = member({ id: "a", displayName: "Ava", sortOrder: 0 });

        expect(orderMembers([joint, ava]).map((m) => m.id)).toEqual(["a", "j"]);
    });

    it("orders persons by sortOrder, not by input order", () => {
        const ben = member({ id: "b", displayName: "Ben", sortOrder: 1 });
        const ava = member({ id: "a", displayName: "Ava", sortOrder: 0 });

        expect(orderMembers([ben, ava]).map((m) => m.id)).toEqual(["a", "b"]);
    });

    it("keeps every member — persons and joint alike", () => {
        const members = [
            member({ id: "a", displayName: "Ava", sortOrder: 0 }),
            member({ id: "b", displayName: "Ben", sortOrder: 1 }),
            member({
                id: "j",
                displayName: "Joint",
                kind: "joint",
                sortOrder: 100,
            }),
        ];

        expect(orderMembers(members)).toHaveLength(3);
    });

    it("does not mutate the array it was given", () => {
        const members = [
            member({ id: "b", displayName: "Ben", sortOrder: 1 }),
            member({ id: "a", displayName: "Ava", sortOrder: 0 }),
        ];

        orderMembers(members);

        expect(members.map((m) => m.id)).toEqual(["b", "a"]);
    });

    it("returns an empty array for no members", () => {
        expect(orderMembers([])).toEqual([]);
    });
});

describe("groupedPotOptions", () => {
    const ava = member({ id: "a", displayName: "Ava", sortOrder: 0 });
    const ben = member({ id: "b", displayName: "Ben", sortOrder: 1 });
    const joint = member({
        id: "j",
        displayName: "Joint",
        kind: "joint",
        sortOrder: 100,
    });

    it("groups pots under their owner, in member order", () => {
        const pots = [
            pot({ id: "p1", name: "Rent", ownerId: "j" }),
            pot({ id: "p2", name: "Rail", ownerId: "a" }),
            pot({ id: "p3", name: "Gym", ownerId: "b" }),
        ];

        expect(groupedPotOptions(pots, [joint, ben, ava])).toEqual([
            { group: "Ava", items: [{ value: "p2", label: "Rail" }] },
            { group: "Ben", items: [{ value: "p3", label: "Gym" }] },
            { group: "Joint", items: [{ value: "p1", label: "Rent" }] },
        ]);
    });

    it("offers every owner’s pots, not just the ones the payer owns", () => {
        const pots = [
            pot({ id: "p1", name: "Rail", ownerId: "a" }),
            pot({ id: "p2", name: "Gym", ownerId: "b" }),
        ];

        expect(groupedPotOptions(pots, [ava, ben]).map((g) => g.group)).toEqual(
            ["Ava", "Ben"]
        );
    });

    it("excludes archived pots", () => {
        const pots = [
            pot({ id: "p1", name: "Rail", ownerId: "a" }),
            pot({
                id: "p2",
                name: "Old",
                ownerId: "a",
                archivedAt: new Date(),
            }),
        ];

        expect(groupedPotOptions(pots, [ava])).toEqual([
            { group: "Ava", items: [{ value: "p1", label: "Rail" }] },
        ]);
    });

    it("drops a member whose only pot is archived, rather than showing an empty group", () => {
        const pots = [
            pot({
                id: "p1",
                name: "Old",
                ownerId: "b",
                archivedAt: new Date(),
            }),
        ];

        expect(groupedPotOptions(pots, [ava, ben])).toEqual([]);
    });

    it("ignores a pot whose owner is not in the member list", () => {
        const pots = [pot({ id: "p1", name: "Orphan", ownerId: "gone" })];

        expect(groupedPotOptions(pots, [ava])).toEqual([]);
    });

    it("returns nothing when there are no pots", () => {
        expect(groupedPotOptions([], [ava, ben, joint])).toEqual([]);
    });
});
