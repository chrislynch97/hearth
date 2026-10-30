import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { trpc } from "@/trpc";
import type { MoneyFormat } from "@/useMoney";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/shadcn/card";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/shadcn/collapsible";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import {
    seedDecisions,
    startsIncluded,
    type Decision,
    type ImportPreview,
    type PreviewRow,
} from "../importModel";
import { ImportRow } from "./ImportRow";

export interface ImportReviewProps {
    preview: ImportPreview;
    ownerId: string;
    filename: string;
    money: MoneyFormat;
    onImported: (result: { imported: number; skipped: number }) => void;
}

/** Everything in the file, before anything is saved. Keyed on the preview, so a
 *  fresh one always starts from its own suggestions. */
export const ImportReview = ({
    preview,
    ownerId,
    filename,
    money,
    onImported,
}: ImportReviewProps) => {
    const utils = trpc.useUtils();
    const potsQuery = trpc.pots.list.useQuery();
    const commit = trpc.imports.commit.useMutation();
    const [decisions, setDecisions] = useState(() =>
        seedDecisions(preview.rows)
    );

    const { rows, summary } = preview;
    const pots = (potsQuery.data ?? []).map((p) => ({
        value: p.id,
        label: p.name,
    }));
    const includedRows = rows.filter((r) => decisions[r.index]?.included);
    const leftOut = rows.filter((r) => !startsIncluded(r));
    const counts = [
        `${summary.new} new`,
        summary.foreign > 0 && `${summary.foreign} foreign`,
        summary.excluded > 0 && `${summary.excluded} internal`,
        summary.duplicate > 0 && `${summary.duplicate} duplicate`,
        summary.error > 0 && `${summary.error} with errors`,
    ].filter(Boolean);

    const decide = (index: number, patch: Partial<Decision>) =>
        setDecisions((current) => ({
            ...current,
            [index]: {
                included: false,
                potId: null,
                ...current[index],
                ...patch,
            },
        }));

    const runImport = async () => {
        const result = await commit.mutateAsync({
            ownerId,
            filename: filename || null,
            source: preview.source,
            mapping: preview.mapping,
            totalRows: summary.total,
            rows: includedRows.map((r) => ({
                importRef: r.importRef,
                date: r.date,
                description: r.description,
                amount: r.amount,
                potId: decisions[r.index]?.potId ?? null,
                note: r.note || null,
                raw: r.raw,
            })),
        });
        await Promise.all([
            utils.spends.list.invalidate(),
            utils.reconcile.backlog.invalidate(),
            utils.dashboard.summary.invalidate(),
        ]);
        onImported({ imported: result.imported, skipped: result.skipped });
    };

    const rowFor = (row: PreviewRow) => (
        <ImportRow
            key={row.index}
            row={row}
            decision={decisions[row.index]}
            pots={pots}
            money={money}
            onChange={(patch) => decide(row.index, patch)}
        />
    );

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Review</CardTitle>
                    <CardDescription>{counts.join(" · ")}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                    <ul className="flex flex-col divide-y divide-border">
                        {rows.filter(startsIncluded).map(rowFor)}
                    </ul>
                    {leftOut.length > 0 && (
                        <Collapsible className="group/leftout flex flex-col gap-1">
                            <CollapsibleTrigger asChild>
                                <Button
                                    variant="ghost"
                                    icon={
                                        <ChevronRight className="transition-transform group-data-[state=open]/leftout:rotate-90" />
                                    }
                                    className="self-start px-2"
                                >
                                    {leftOut.length} left out
                                </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                                <ul className="flex flex-col divide-y divide-border">
                                    {leftOut.map(rowFor)}
                                </ul>
                            </CollapsibleContent>
                        </Collapsible>
                    )}
                </CardContent>
            </Card>
            {commit.error && (
                <Notice tone="danger" title="Import failed">
                    {commit.error.message}
                </Notice>
            )}
            <div className="sticky bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 flex items-center justify-between gap-3 rounded-xl border border-border bg-raised p-3 shadow-raised">
                <span className="text-base text-text-muted">
                    {includedRows.length} selected
                </span>
                <Button
                    variant="solid"
                    disabled={includedRows.length === 0 || commit.isPending}
                    onClick={() => void runImport()}
                >
                    Import {includedRows.length}{" "}
                    {includedRows.length === 1 ? "transaction" : "transactions"}
                </Button>
            </div>
        </>
    );
};
