import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/trpc/router";

type ImportOutputs = inferRouterOutputs<AppRouter>["imports"];

export type ImportPreview = ImportOutputs["preview"];
export type PreviewRow = ImportPreview["rows"][number];
export type ImportProfile = ImportOutputs["profiles"][number];

export interface Decision {
    included: boolean;
    potId: string | null;
}

/** New and foreign rows go in unless someone says otherwise. */
export const startsIncluded = (row: PreviewRow): boolean =>
    row.status === "new" || row.status === "foreign";

/** A duplicate or unreadable row can't be imported; an internal move can, if
 *  someone ticks it. */
export const isImportable = (row: PreviewRow): boolean =>
    startsIncluded(row) || row.status === "excluded";

export const seedDecisions = (rows: PreviewRow[]): Record<number, Decision> =>
    Object.fromEntries(
        rows.map((row) => [
            row.index,
            { included: startsIncluded(row), potId: row.suggestedPotId },
        ])
    );
